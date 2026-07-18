import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  loadCompanySites,
  readCachedCompanySites,
  reverseGeocode,
  type CompanySite
} from "../lib/companySitesRepo";
import {
  intervalTypeLabel,
  resolveScheduleForProfile,
  type WorkInterval,
  type WorkSchedule
} from "../lib/workSchedulesRepo";
import {
  loadCompanySettings,
  readCachedCompanySettings,
  type CompanySettings
} from "../lib/companySettingsRepo";
import { isDateInClosedPeriod } from "../lib/periodLock";
import { isUuid } from "../lib/profileRepo";
import {
  loadProfileSiteAssignments,
  readAssignedSiteIds
} from "../lib/profileSitesRepo";
import {
  appendTimeEntry,
  loadTimeEntries,
  readLastPunchForUser,
  uploadTimeEntryPhoto,
  type ExternalPunchType
} from "../lib/timeEntriesRepo";
import { isAdminRole } from "../lib/roles";

type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

type NextAction = {
  type: PunchType;
  label: string;
};

type GeofenceCheck = {
  enabled: boolean;
  blocked: boolean;
  reason: string;
  nearestSite: CompanySite | null;
  distanceMeters: number | null;
  allowExternal: boolean;
};

function resolveNextAction(settings: CompanySettings, userId?: string): NextAction {
  const isSimpleMode = settings.mode === "SIMPLE";
  const lastEntry = readLastPunchForUser(userId);

  if (!lastEntry || lastEntry.type === "CLOCK_OUT") {
    return { type: "CLOCK_IN", label: "Registrar Entrada" };
  }
  if (lastEntry.type === "CLOCK_IN") {
    if (isSimpleMode) {
      return { type: "CLOCK_OUT", label: "Registrar Saida" };
    }
    return { type: "BREAK_START", label: "Iniciar Intervalo" };
  }
  if (lastEntry.type === "BREAK_START") {
    return { type: "BREAK_END", label: "Voltar do Intervalo" };
  }
  if (lastEntry.type === "BREAK_END") {
    return { type: "CLOCK_OUT", label: "Registrar Saida" };
  }
  return { type: "CLOCK_IN", label: "Registrar Entrada" };
}

async function generateEntryHash(data: string) {
  if (!crypto?.subtle) return "";
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return Math.max(0, Math.min(23, Math.floor(hour))) * 60 + Math.max(0, Math.min(59, Math.floor(minute)));
}

function getMinutesInTimezone(date: Date, timezone?: string): number {
  try {
    if (!timezone) {
      return date.getHours() * 60 + date.getMinutes();
    }
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return date.getHours() * 60 + date.getMinutes();
    }
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

function formatTimeInTimezone(date: Date, timezone?: string): string {
  try {
    if (!timezone) {
      return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return date.toLocaleTimeString("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

function isWithinWindow(
  nowMinutes: number,
  windowStart: number,
  windowEnd: number,
  tolerance: number
): boolean {
  const start = windowStart - tolerance;
  const end = windowEnd + tolerance;

  if (windowEnd >= windowStart) {
    return nowMinutes >= start && nowMinutes <= end;
  }
  return nowMinutes >= start || nowMinutes <= end;
}

function getLocationSettingsLink(): { label: string; url: string } | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (ua.includes("Edg/")) {
    return { label: "Abrir configuracoes do Edge", url: "edge://settings/content/location" };
  }
  if (ua.includes("Chrome") && !ua.includes("Edg/") && !ua.includes("OPR/") && !ua.includes("Brave")) {
    return { label: "Abrir configuracoes do Chrome", url: "chrome://settings/content/location" };
  }
  return null;
}

function getAllowedSites(
  allSites: CompanySite[],
  settings: CompanySettings,
  assignedIds: string[],
  userId?: string
): CompanySite[] {
  const activeSites = allSites.filter((site) => site.isActive);
  if (settings.siteAccessPolicy === "ANY_SITE") return activeSites;
  const assignedSet = new Set(assignedIds);
  const assignedSites = activeSites.filter((site) => assignedSet.has(site.id));
  if (assignedSites.length > 0) return assignedSites;
  if (!isUuid(userId)) return [];
  return [];
}

function evaluateGeofence(
  settings: CompanySettings,
  allowedSites: CompanySite[],
  locationData: { lat: number; lng: number } | null
): GeofenceCheck {
  if (settings.siteAccessPolicy === "ASSIGNED_ONLY" && allowedSites.length === 0) {
    return {
      enabled: true,
      blocked: true,
      reason: "Local não permitido. Nenhuma filial atribuida ao colaborador.",
      nearestSite: null,
      distanceMeters: null,
      allowExternal: false
    };
  }

  if (!settings.geofenceEnabled) {
    return {
      enabled: false,
      blocked: false,
      reason: "Geofence desativada.",
      nearestSite: null,
      distanceMeters: null,
      allowExternal: false
    };
  }

  if (allowedSites.length === 0) {
    const allowExternal =
      settings.outsideAreaPolicy === "ALLOW_WITH_JUSTIFICATION" &&
      settings.externalPunchEnabled;
    return {
      enabled: true,
      blocked: true,
      reason: "Local não permitido. Nenhuma filial permitida foi encontrada para este colaborador.",
      nearestSite: null,
      distanceMeters: null,
      allowExternal
    };
  }

  if (!locationData) {
    const allowExternal =
      settings.outsideAreaPolicy === "ALLOW_WITH_JUSTIFICATION" &&
      settings.externalPunchEnabled;
    return {
      enabled: true,
      blocked: true,
      reason: "Aguardando localizacao para validar geofence.",
      nearestSite: null,
      distanceMeters: null,
      allowExternal
    };
  }

  let nearestSite: CompanySite | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let insideAnySite = false;

  for (const site of allowedSites) {
    const distance = calculateDistanceMeters(
      { lat: locationData.lat, lng: locationData.lng },
      { lat: site.lat, lng: site.lng }
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSite = site;
    }
    if (distance <= site.radiusMeters) {
      insideAnySite = true;
    }
  }

  const blocked = !insideAnySite;
  const allowExternal =
    blocked &&
    settings.outsideAreaPolicy === "ALLOW_WITH_JUSTIFICATION" &&
    settings.externalPunchEnabled;

  if (!nearestSite || !Number.isFinite(nearestDistance)) {
    return {
      enabled: true,
      blocked,
      reason: blocked
        ? "Nao foi possivel identificar uma filial de referencia."
        : "Geofence validada.",
      nearestSite: null,
      distanceMeters: null,
      allowExternal
    };
  }

  const nearestSiteRef = nearestSite;

  return {
    enabled: true,
    blocked,
    reason: blocked
      ? `Fora das filiais permitidas. Filial mais proxima: ${nearestSiteRef.name} (${nearestDistance}m).`
      : `Dentro da filial ${nearestSiteRef.name} (${nearestDistance}m).`,
    nearestSite: nearestSiteRef,
    distanceMeters: nearestDistance,
    allowExternal
  };
}

export default function PunchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number; address: string } | null>(null);
  const lastReverseLookupRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const [hasCamera, setHasCamera] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [locationData, setLocationData] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<"locating" | "ok" | "error">("locating");
  const [locationPermission, setLocationPermission] = useState<PermissionState | "unknown">("unknown");
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationTimestamp, setLocationTimestamp] = useState<number | null>(null);
  const [locationErrorCode, setLocationErrorCode] = useState<number | null>(null);
  const [showLocationDiagnostics, setShowLocationDiagnostics] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule | null>(null);
  const [workIntervals, setWorkIntervals] = useState<WorkInterval[]>([]);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [nextAction, setNextAction] = useState<NextAction>(() =>
    resolveNextAction(readCachedCompanySettings(), user?.id)
  );
  const [periodLocked, setPeriodLocked] = useState(() => isDateInClosedPeriod(new Date()));
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() =>
    readCachedCompanySettings()
  );
  const [companySites, setCompanySites] = useState<CompanySite[]>(() =>
    readCachedCompanySites()
  );
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>(() =>
    readAssignedSiteIds(user?.id ?? "")
  );

  const [showExternalModal, setShowExternalModal] = useState(false);
  const [externalType, setExternalType] = useState<ExternalPunchType>("EXTERNAL_VISIT");
  const [externalNote, setExternalNote] = useState("");
  const [externalError, setExternalError] = useState<string | null>(null);

  const handleLocationSuccess = (position: GeolocationPosition) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const invalid =
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001);
    if (invalid) {
      setLocationStatus("error");
      setLocationError("Localizacao indisponivel");
      if (lastLocationRef.current) {
        setLocationData(lastLocationRef.current);
      } else {
        setLocationData(null);
      }
      return;
    }

    setLocationStatus("ok");
    setLocationError(null);
    setLocationErrorCode(null);
    if (Number.isFinite(position.coords.accuracy)) {
      setLocationAccuracy(Math.round(position.coords.accuracy));
    } else {
      setLocationAccuracy(null);
    }
    setLocationTimestamp(position.timestamp);
    const nextLocation = {
      lat,
      lng,
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    };
    setLocationData(nextLocation);
    lastLocationRef.current = nextLocation;
  };

  const handleLocationError = (error?: GeolocationPositionError) => {
    let message = "Sinal GPS fraco";
    if (error?.code === 1) message = "Permissao de localizacao negada";
    if (error?.code === 3) message = "Tempo limite de localizacao";
    setLocationStatus("error");
    setLocationErrorCode(error?.code ?? null);
    if (lastLocationRef.current) {
      setLocationError(`${message}. Usando ultima localizacao conhecida.`);
      setLocationData((prev) => prev ?? lastLocationRef.current);
    } else {
      setLocationError(message);
      setLocationData(null);
    }
  };

  const requestLocation = async () => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      setLocationError("GPS nao suportado");
      setLocationData(null);
      return;
    }

    setLocationStatus("locating");
    setLocationError(null);

    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({
          name: "geolocation" as PermissionName
        });
        setLocationPermission(permission.state);
        permission.onchange = () => {
          setLocationPermission(permission.state);
        };
        if (permission.state === "denied") {
          handleLocationError({ code: 1 } as GeolocationPositionError);
          return;
        }
      } else {
        setLocationPermission("unknown");
      }
    } catch {
      // ignore permission checks
    }

    navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  };

  const allowedSites = useMemo(
    () => getAllowedSites(companySites, companySettings, assignedSiteIds, user?.id),
    [companySites, companySettings, assignedSiteIds, user?.id]
  );
  const activeSites = useMemo(() => companySites.filter((site) => site.isActive), [companySites]);
  const hasActiveSites = activeSites.length > 0;
  const hasAssignedSites = assignedSiteIds.length > 0;
  const requiresAssignment =
    companySettings.geofenceEnabled && companySettings.siteAccessPolicy === "ASSIGNED_ONLY";

  const resolvedLocation =
    locationStatus === "ok" && locationData
      ? { lat: locationData.lat, lng: locationData.lng }
      : null;

  const geofenceCheck = useMemo(
    () => evaluateGeofence(companySettings, allowedSites, resolvedLocation),
    [companySettings, allowedSites, resolvedLocation]
  );

  const hasLocation = Boolean(locationData);
  const siteLabel = geofenceCheck.nearestSite?.name ?? null;
  const siteAddressLabel = useMemo(() => {
    const site = geofenceCheck.nearestSite;
    if (!site) return null;
    const addressLine =
      site.addressLine && site.addressLine !== "Endereco nao informado"
        ? site.addressLine
        : "";
    const cityState = [site.city, site.state].filter(Boolean).join(" - ");
    const parts = [addressLine, cityState, site.postalCode].filter(Boolean);
    return parts.length > 0 ? parts.join(" • ") : null;
  }, [geofenceCheck.nearestSite]);

  const locationDescription = useMemo(() => {
    if (siteLabel) {
      if (siteAddressLabel) return `${siteLabel} - ${siteAddressLabel}`;
      return siteLabel;
    }
    if (resolvedAddress) return resolvedAddress;
    if (locationData?.address) return locationData.address;
    if (locationError) return `Localizacao indisponivel (${locationError})`;
    return "Localizacao nao informada";
  }, [siteLabel, siteAddressLabel, resolvedAddress, locationData?.address, locationError]);

  const hardBlockedByGeofence =
    geofenceCheck.enabled && geofenceCheck.blocked && !geofenceCheck.allowExternal;

  const canProceedWithoutLocation =
    !companySettings.geofenceEnabled || geofenceCheck.allowExternal;
  const lastPunch = readLastPunchForUser(user?.id);
  const singleInterval = workIntervals.length === 1 ? workIntervals[0] : null;
  const lastInterval =
    lastPunch?.scheduleIntervalId
      ? workIntervals.find((interval) => interval.id === lastPunch.scheduleIntervalId) ?? null
      : lastPunch?.intervalType
        ? workIntervals.find((interval) => interval.type === lastPunch.intervalType) ?? null
        : null;
  const intervalLabelForStart = singleInterval
    ? intervalTypeLabel(singleInterval.type, true)
    : "Intervalo";
  const intervalLabelForEnd = lastInterval
    ? intervalTypeLabel(lastInterval.type, true)
    : intervalLabelForStart;

  useEffect(() => {
    if (locationStatus !== "ok" || !locationData) return;
    if (!navigator.onLine) return;

    const siteHasAddress =
      typeof siteAddressLabel === "string" &&
      !siteAddressLabel.toLowerCase().includes("nao informado");

    if (siteHasAddress && !geofenceCheck.blocked) {
      return;
    }

    const now = Date.now();
    const lastLookup = lastReverseLookupRef.current;
    if (lastLookup) {
      const distance = calculateDistanceMeters(
        { lat: locationData.lat, lng: locationData.lng },
        { lat: lastLookup.lat, lng: lastLookup.lng }
      );
      if (distance < 80 && now - lastLookup.at < 2 * 60 * 1000) {
        return;
      }
    }

    let active = true;
    setIsResolvingAddress(true);
    reverseGeocode(locationData.lat, locationData.lng)
      .then((result) => {
        if (!active) return;
        if (result?.displayName) {
          setResolvedAddress(result.displayName);
        } else {
          setResolvedAddress(null);
        }
        lastReverseLookupRef.current = {
          lat: locationData.lat,
          lng: locationData.lng,
          at: now
        };
      })
      .finally(() => {
        if (active) setIsResolvingAddress(false);
      });

    return () => {
      active = false;
    };
  }, [
    locationStatus,
    locationData?.lat,
    locationData?.lng,
    siteAddressLabel,
    geofenceCheck.blocked
  ]);

  useEffect(() => {
    const determineState = (settings: CompanySettings) => {
      setNextAction(resolveNextAction(settings, user?.id));
    };

    const handleOnlineStatus = () => setIsOffline(!navigator.onLine);
    const refresh = () => {
      const cachedSettings = readCachedCompanySettings();
      setCompanySettings(cachedSettings);
      setCompanySites(readCachedCompanySites());
      setAssignedSiteIds(readAssignedSiteIds(user?.id ?? ""));
      setPeriodLocked(isDateInClosedPeriod(new Date()));
      determineState(cachedSettings);
      const schedulePromise = user?.id
        ? resolveScheduleForProfile(user.id, user.id)
        : Promise.resolve({ schedule: null, intervals: [] });
      void Promise.all([
        loadCompanySettings(user?.id),
        loadCompanySites(user?.id),
        loadProfileSiteAssignments(user?.id, user?.id),
        loadTimeEntries({ userId: user?.id }),
        schedulePromise
      ])
        .then(([nextSettings, nextSites, profileSites, _entries, scheduleResult]) => {
          setCompanySettings(nextSettings);
          setCompanySites(nextSites);
          setAssignedSiteIds(
            profileSites
              .filter((assignment) => assignment.profileId === (user?.id ?? ""))
              .map((assignment) => assignment.siteId)
          );
          determineState(nextSettings);
          setWorkSchedule(scheduleResult.schedule);
          setWorkIntervals(scheduleResult.intervals);
        })
        .catch(() => {
          determineState(cachedSettings);
        });
    };

    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOnlineStatus);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setPeriodLocked(isDateInClosedPeriod(now));
    }, 1000);

    refresh();

    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setHasCamera(false);
      }
    };
    void startCamera();

    let watchId: number | null = null;

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      });
      void requestLocation();
    } else {
      setLocationStatus("error");
      setLocationError("GPS nao suportado");
      setLocationData(null);
    }

    return () => {
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [user?.id]);

  const evaluateIntervalStart = (interval: WorkInterval | null) => {
    if (!interval || !workSchedule) return { note: null };
    const startMin = parseTimeToMinutes(interval.windowStart);
    const endMin = parseTimeToMinutes(interval.windowEnd);
    if (startMin === null || endMin === null) return { note: null };
    const tolerance = interval.toleranceMin ?? workSchedule.defaultToleranceMin ?? 0;
    const now = new Date();
    const nowMinutes = getMinutesInTimezone(now, workSchedule.timezone);
    const within = isWithinWindow(nowMinutes, startMin, endMin, tolerance);
    if (within) return { note: null };
    const nowLabel = formatTimeInTimezone(now, workSchedule.timezone);
    return {
      note: `Inicio do ${intervalTypeLabel(interval.type, true)} fora da janela ${interval.windowStart}-${interval.windowEnd} (tolerancia ${tolerance}min). Hora registrada: ${nowLabel}.`
    };
  };

  const evaluateIntervalEnd = (
    interval: WorkInterval | null,
    startTimestamp?: string
  ) => {
    if (!interval || !workSchedule || !startTimestamp) return { note: null };
    const startDate = new Date(startTimestamp);
    if (Number.isNaN(startDate.getTime())) return { note: null };
    const now = new Date();
    const durationMin = Math.round((now.getTime() - startDate.getTime()) / 60000);
    const tolerance = interval.toleranceMin ?? workSchedule.defaultToleranceMin ?? 0;
    const diff = Math.abs(durationMin - interval.durationMin);
    if (diff <= tolerance) return { note: null };
    return {
      note: `Duracao do ${intervalTypeLabel(interval.type, true)} fora do previsto: ${durationMin}min (previsto ${interval.durationMin}min ±${tolerance}min).`
    };
  };

  const persistEntry = async (options?: {
    external?: { type: ExternalPunchType; note: string };
    interval?: WorkInterval | null;
    intervalNote?: string | null;
  }) => {
    if (isProcessing || !user) return;
    if (periodLocked) {
      setSubmissionError("Periodo mensal fechado. Esta marcacao nao pode ser registrada.");
      return;
    }
    if (hardBlockedByGeofence) {
      setSubmissionError(geofenceCheck.reason || "Marcacao bloqueada pela politica de geofence.");
      return;
    }
    if (!resolvedLocation && !canProceedWithoutLocation) {
      setSubmissionError("Aguardando localizacao para registrar o ponto.");
      return;
    }

    setSubmissionError(null);
    setIsProcessing(true);

    let photoDataUrl = "";
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        photoDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      }
    }

    const timestampIso = currentTime.toISOString();
    const isActuallyOffline = !navigator.onLine;
    const status: "PENDING" | "SYNCED" = isActuallyOffline ? "PENDING" : "SYNCED";
    const integrityString = `${user.id}|${timestampIso}|${nextAction.type}`;
    const entryHash = await generateEntryHash(integrityString);

    const siteRef = geofenceCheck.nearestSite;
    const isExternal = Boolean(options?.external);
    const interval = options?.interval ?? null;
    const intervalNote = options?.intervalNote ?? null;
    let uploadedPhotoPath: string | undefined;
    let uploadedPhotoUrl: string | undefined;

    if (photoDataUrl && navigator.onLine) {
      try {
        const uploadResult = await uploadTimeEntryPhoto(user.id, photoDataUrl);
        if (uploadResult) {
          uploadedPhotoPath = uploadResult.photoPath;
          uploadedPhotoUrl = uploadResult.photoUrl;
        }
      } catch {
        setSubmissionError("Nao foi possivel enviar a foto. Tente novamente.");
        setIsProcessing(false);
        return;
      }
    }

    const persistedEntry = await appendTimeEntry({
      id: `${Date.now()}`,
      userId: user.id,
      type: nextAction.type,
      timestamp: timestampIso,
      location: locationDescription,
      coordinates: resolvedLocation ? { lat: resolvedLocation.lat, lng: resolvedLocation.lng } : undefined,
      photoUrl: uploadedPhotoUrl ?? (photoDataUrl || undefined),
      photoPath: uploadedPhotoPath,
      status,
      hash: entryHash,
      deviceInfo: navigator.userAgent,
      source: "WEB",
      siteId: siteRef?.id,
      siteTimezone: siteRef?.timezone,
      outsideGeofence: geofenceCheck.enabled ? geofenceCheck.blocked : false,
      externalPunch: isExternal,
      externalType: options?.external?.type,
      externalNote: options?.external?.note,
      intervalType: interval?.type,
      scheduleId: interval ? workSchedule?.id : undefined,
      scheduleIntervalId: interval?.id,
      scheduleViolation: Boolean(intervalNote),
      scheduleNote: intervalNote ?? undefined
    });

    appendAuditLog({
      actorId: user.id,
      action: "time_entry_created",
      entityType: "time_entry",
      entityId: persistedEntry.id,
      payload: {
        type: persistedEntry.type,
        status: persistedEntry.status,
        timestamp: persistedEntry.timestamp,
        geofenceEnabled: companySettings.geofenceEnabled,
        geofenceDistanceMeters: geofenceCheck.distanceMeters,
        siteId: siteRef?.id,
        outsideGeofence: geofenceCheck.blocked,
        externalPunch: isExternal,
        externalType: options?.external?.type,
        intervalType: interval?.type,
        scheduleViolation: Boolean(intervalNote)
      }
    });

    navigate("/success", {
      state: { entry: persistedEntry, isOffline: isActuallyOffline, label: actionLabel }
    });
  };

  const handleConfirm = async () => {
    if (geofenceCheck.allowExternal && geofenceCheck.blocked) {
      setExternalError(null);
      setExternalNote("");
      setExternalType("EXTERNAL_VISIT");
      setShowExternalModal(true);
      return;
    }
    if (nextAction.type === "BREAK_START") {
      if (workIntervals.length > 1) {
        setShowIntervalModal(true);
        return;
      }
      const interval = singleInterval;
      const note = evaluateIntervalStart(interval).note;
      await persistEntry({ interval, intervalNote: note });
      return;
    }
    if (nextAction.type === "BREAK_END") {
      const interval = lastInterval;
      const note = evaluateIntervalEnd(interval, lastPunch?.timestamp).note;
      await persistEntry({ interval, intervalNote: note });
      return;
    }
    await persistEntry();
  };

  const handleConfirmExternal = async () => {
    const note = externalNote.trim();
    if (note.length < 5) {
      setExternalError("Informe uma observacao valida para o registro de ponto externo.");
      return;
    }
    setShowExternalModal(false);
    await persistEntry({
      external: {
        type: externalType,
        note
      }
    });
  };

  const handleSelectInterval = async (interval: WorkInterval) => {
    setShowIntervalModal(false);
    const note = evaluateIntervalStart(interval).note;
    await persistEntry({ interval, intervalNote: note });
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const locationTitle = hasLocation
    ? siteLabel
      ? `Filial: ${siteLabel}`
      : resolvedAddress ?? "Localizacao atual"
    : locationStatus === "error"
      ? locationError ?? "Localizacao indisponivel"
      : "Localizando...";

  const locationCoordsLabel = locationData
    ? `${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)}`
    : locationStatus === "error"
      ? "Lat/Lng indisponiveis"
      : "";

  const locationExtraLabel = hasLocation
    ? siteLabel
      ? siteAddressLabel ?? resolvedAddress
      : resolvedAddress
    : null;
  const settingsLink = useMemo(() => getLocationSettingsLink(), []);

  const actionLabel =
    nextAction.type === "BREAK_START"
      ? `Iniciar ${intervalLabelForStart}`
      : nextAction.type === "BREAK_END"
        ? `Voltar do ${intervalLabelForEnd}`
        : nextAction.label;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100">
      <canvas ref={canvasRef} className="hidden"></canvas>
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          disabled={isProcessing}
          className="flex size-10 items-center justify-center rounded-full hover:bg-slate-200 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="flex-1 pr-10 text-center text-lg font-bold">Registrar Ponto</h2>
      </div>

      {isOffline && (
        <div className="border-b border-amber-200 bg-amber-100 py-1 text-center text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Modo Offline • Salvando Localmente
        </div>
      )}
      {periodLocked && (
        <div className="border-b border-rose-200 bg-rose-100 py-1 text-center text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
          Periodo mensal fechado • Novas marcacoes bloqueadas
        </div>
      )}
      {geofenceCheck.enabled && (
        <div
          className={`border-b py-1 text-center text-xs font-bold ${
            geofenceCheck.blocked
              ? geofenceCheck.allowExternal
                ? "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                : "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
          }`}
        >
          {geofenceCheck.blocked
            ? geofenceCheck.allowExternal
              ? "Fora da area • Registro externo permitido com justificativa"
              : "Local não permitido"
            : "Dentro da area permitida"}
        </div>
      )}

      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-24">
        <div className="flex flex-col items-center pb-2 pt-4">
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight tabular-nums">
            {formatTime(currentTime)}
          </h1>
          <p className="pt-2 text-sm font-medium capitalize text-slate-500 dark:text-slate-400">
            {formatDate(currentTime)}
          </p>
        </div>

        <p className="pb-4 pt-2 text-center text-base font-medium">
          {isProcessing ? "Salvando Registro..." : "Posicione seu rosto para verificacao"}
        </p>

        {submissionError && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {submissionError}
          </div>
        )}

        {companySettings.geofenceEnabled && !hasActiveSites && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Nenhuma filial ativa encontrada. Cadastre uma filial para liberar o ponto.
            {isAdminRole(user?.role) && (
              <button
                type="button"
                onClick={() => navigate("/configuracoes-empresa")}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
              >
                Ir para Configuracoes
              </button>
            )}
          </div>
        )}

        {requiresAssignment && !hasAssignedSites && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Nenhuma filial atribuida ao colaborador. Solicite a atribuicao para registrar ponto.
            {isAdminRole(user?.role) && user?.id && (
              <button
                type="button"
                onClick={() => navigate(`/colaboradores/${user.id}`)}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
              >
                Gerenciar Filiais
              </button>
            )}
          </div>
        )}

        <div className="relative mx-auto aspect-[3/4] w-full max-h-[45vh] max-w-sm overflow-hidden rounded-2xl border-2 border-white bg-black shadow-lg dark:border-slate-700">
          {hasCamera ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-slate-700"></div>
          )}
          <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2 py-1 text-[10px] font-bold text-white">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"></div>
            AO VIVO
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#1a2632]">
          <div className="relative h-16 w-16 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700">
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`material-symbols-outlined text-3xl ${
                  locationStatus === "error" ? "text-orange-500" : "text-primary"
                }`}
              >
                {locationStatus === "error" ? "location_off" : "location_on"}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {locationTitle}
            </p>
            {locationExtraLabel && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {locationExtraLabel}
              </p>
            )}
            {isResolvingAddress && hasLocation && !locationExtraLabel && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Buscando endereco...</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {hasLocation
                ? locationCoordsLabel
                : locationStatus === "error"
                  ? "GPS indisponivel"
                  : "Aguardando sinal..."}
            </p>
            {locationStatus === "error" && locationError && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                {locationError}
              </p>
            )}
            {locationStatus === "error" && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Verifique a permissao de localizacao do navegador e do sistema.
              </p>
            )}
            <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {geofenceCheck.reason}
            </p>
            {geofenceCheck.nearestSite && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Filial de referencia: {geofenceCheck.nearestSite.name}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {locationStatus !== "ok" && (
                <button
                  type="button"
                  onClick={() => void requestLocation()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Tentar novamente
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLocationDiagnostics(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <span className="material-symbols-outlined text-[14px]">help</span>
                Diagnostico
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto max-w-md border-t border-slate-200 bg-background-light/90 p-4 backdrop-blur-md dark:border-slate-800 dark:bg-background-dark/90">
        <button
          onClick={() => void handleConfirm()}
          disabled={
            isProcessing ||
            periodLocked ||
            hardBlockedByGeofence ||
            (!locationData && !canProceedWithoutLocation)
          }
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:bg-slate-400"
        >
          {isProcessing ? (
            <span>Salvando...</span>
          ) : (
            <>
              <span className="material-symbols-outlined">fingerprint</span>
              {hardBlockedByGeofence
                ? "Local não permitido"
                : geofenceCheck.allowExternal && geofenceCheck.blocked
                  ? "Registrar ponto externo"
                  : actionLabel}
            </>
          )}
        </button>
      </div>

      {showIntervalModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Selecione o intervalo
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Escolha o tipo de intervalo que sera registrado.
            </p>
            <div className="mt-4 space-y-2">
              {workIntervals.map((interval) => (
                <button
                  key={interval.id}
                  type="button"
                  onClick={() => void handleSelectInterval(interval)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {intervalTypeLabel(interval.type)}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    Janela: {interval.windowStart} - {interval.windowEnd} • Duracao: {interval.durationMin}min
                    {interval.toleranceMin !== undefined ? ` • Tolerancia: ${interval.toleranceMin}min` : ""}
                  </span>
                </button>
              ))}
              {workIntervals.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Nenhum intervalo configurado.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowIntervalModal(false)}
              className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showExternalModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Registro de ponto externo
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Informe o tipo e a observacao obrigatoria para concluir o registro.
            </p>

            <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400">
              Tipo do registro externo
              <select
                value={externalType}
                onChange={(event) => setExternalType(event.target.value as ExternalPunchType)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="HOME_OFFICE">Home Office</option>
                <option value="EXTERNAL_VISIT">Visita Externa</option>
                <option value="FIELD_SERVICE">Atendimento Externo</option>
                <option value="OTHER">Outro</option>
              </select>
            </label>

            <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400">
              Observacao
              <textarea
                value={externalNote}
                onChange={(event) => {
                  setExternalError(null);
                  setExternalNote(event.target.value);
                }}
                rows={4}
                placeholder="Ex: Atendimento em cliente na zona sul."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>

            {externalError && (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                {externalError}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowExternalModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmExternal()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Confirmar ponto
              </button>
            </div>
          </div>
        </div>
      )}

      {showLocationDiagnostics && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Diagnostico de localizacao
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Confira os detalhes do GPS e das permissoes do navegador.
            </p>

            <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <p>
                <span className="font-semibold">Suporte:</span>{" "}
                {"geolocation" in navigator ? "Disponivel" : "Nao suportado"}
              </p>
              <p>
                <span className="font-semibold">Permissao:</span>{" "}
                {locationPermission === "unknown"
                  ? "Nao verificado"
                  : locationPermission === "granted"
                    ? "Permitido"
                    : locationPermission === "denied"
                      ? "Negado"
                      : "Perguntar"}
              </p>
              <p>
                <span className="font-semibold">Status atual:</span>{" "}
                {locationStatus === "ok"
                  ? "Localizacao obtida"
                  : locationStatus === "locating"
                    ? "Localizando"
                    : "Erro"}
              </p>
              <p>
                <span className="font-semibold">Ultimo erro:</span>{" "}
                {locationError ?? "Nenhum"}
              </p>
              <p>
                <span className="font-semibold">Codigo do erro:</span>{" "}
                {locationErrorCode ?? "N/A"}
              </p>
              <p>
                <span className="font-semibold">Precisao:</span>{" "}
                {locationAccuracy !== null ? `${locationAccuracy}m` : "Nao disponivel"}
              </p>
              <p>
                <span className="font-semibold">Ultima atualizacao:</span>{" "}
                {locationTimestamp
                  ? new Date(locationTimestamp).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    })
                  : "Nao informada"}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowLocationDiagnostics(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => void requestLocation()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Testar agora
              </button>
            </div>

            {settingsLink && (
              <button
                type="button"
                onClick={() => window.open(settingsLink.url, "_blank")}
                className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {settingsLink.label}
              </button>
            )}

            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              Dica: confirme a permissao de localizacao no navegador e ative o GPS do sistema.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
