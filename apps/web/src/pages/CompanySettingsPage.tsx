import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  loadBillingStatus,
  openStripeCheckout,
  openStripePortal,
  type BillingStatus
} from "../lib/billing";
import {
  createCompanySite,
  geocodeAddress,
  loadCompanySites,
  setCompanySiteActive,
  updateCompanySite,
  type CompanySite
} from "../lib/companySitesRepo";
import {
  loadCompanySettings,
  saveCompanySettings,
  type OutsideAreaPolicy,
  type SiteAccessPolicy
} from "../lib/companySettingsRepo";
import {
  intervalTypeLabel,
  loadWorkIntervals,
  loadWorkSchedules,
  saveWorkIntervals,
  saveWorkSchedule,
  type IntervalType,
  type WorkInterval
} from "../lib/workSchedulesRepo";
import {
  getCurrentPeriodId,
  isPeriodClosed,
  readClosedPeriods,
  setPeriodClosed
} from "../lib/periodLock";

type SiteFormState = {
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  radiusMeters: string;
  timezone: string;
  lat: string;
  lng: string;
};

type IntervalFormState = {
  id?: string;
  type: IntervalType;
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
  durationMin: string;
  toleranceMin: string;
};

type CompanySettingsRouteState = {
  openSiteModal?: boolean;
  companyId?: string;
  companyName?: string;
};

const DEFAULTS = {
  mode: "FULL" as "SIMPLE" | "FULL",
  workHours: 8,
  tolerance: 10,
  geofenceEnabled: false,
  siteAccessPolicy: "ASSIGNED_ONLY" as SiteAccessPolicy,
  outsideAreaPolicy: "BLOCK_ALWAYS" as OutsideAreaPolicy,
  externalPunchEnabled: false
};

const DEFAULT_SITE_FORM: SiteFormState = {
  name: "",
  addressLine: "",
  city: "",
  state: "",
  postalCode: "",
  country: "BR",
  radiusMeters: "200",
  timezone: "America/Sao_Paulo",
  lat: "",
  lng: ""
};

const INTERVAL_TYPES: IntervalType[] = ["LUNCH", "DINNER", "SNACK_AM", "SNACK_PM"];

const DEFAULT_INTERVAL_PRESETS: Record<IntervalType, Omit<IntervalFormState, "type" | "enabled">> = {
  LUNCH: { windowStart: "12:00", windowEnd: "13:30", durationMin: "60", toleranceMin: "10" },
  DINNER: { windowStart: "19:00", windowEnd: "20:30", durationMin: "60", toleranceMin: "10" },
  SNACK_AM: { windowStart: "10:00", windowEnd: "10:30", durationMin: "15", toleranceMin: "5" },
  SNACK_PM: { windowStart: "15:30", windowEnd: "16:00", durationMin: "15", toleranceMin: "5" }
};

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function normalizeSiteForm(form: SiteFormState) {
  const name = cleanText(form.name);
  const addressLine = cleanText(form.addressLine);
  const city = cleanText(form.city);
  const state = cleanText(form.state);
  const postalCode = cleanText(form.postalCode);
  const country = cleanText(form.country).toUpperCase() || "BR";
  const timezone = cleanText(form.timezone) || "America/Sao_Paulo";
  const radiusMeters = Number(form.radiusMeters);
  const lat = Number(form.lat);
  const lng = Number(form.lng);

  if (name.length < 2) return null;
  if (addressLine.length < 4) return null;
  if (!Number.isFinite(radiusMeters) || radiusMeters < 20 || radiusMeters > 5000) {
    return null;
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;

  return {
    name,
    addressLine,
    city,
    state,
    postalCode,
    country,
    radiusMeters: Math.round(radiusMeters),
    timezone,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

function buildIntervalForms(intervals: WorkInterval[]): IntervalFormState[] {
  return INTERVAL_TYPES.map((type) => {
    const existing = intervals.find((interval) => interval.type === type);
    const preset = DEFAULT_INTERVAL_PRESETS[type];
    return {
      id: existing?.id,
      type,
      enabled: Boolean(existing),
      windowStart: existing?.windowStart ?? preset.windowStart,
      windowEnd: existing?.windowEnd ?? preset.windowEnd,
      durationMin: String(existing?.durationMin ?? preset.durationMin),
      toleranceMin: String(existing?.toleranceMin ?? preset.toleranceMin)
    };
  });
}

export default function CompanySettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const routeState = (location.state as CompanySettingsRouteState | null) ?? null;
  const [scopedCompanyId] = useState<string | null>(() => routeState?.companyId ?? null);
  const [scopedCompanyName] = useState<string | null>(() => routeState?.companyName ?? null);
  const [openSiteModalOnEntry] = useState(() => Boolean(routeState?.openSiteModal));

  const [mode, setMode] = useState<"SIMPLE" | "FULL">(DEFAULTS.mode);
  const [workHours, setWorkHours] = useState(DEFAULTS.workHours);
  const [tolerance, setTolerance] = useState(DEFAULTS.tolerance);
  const [geofenceEnabled, setGeofenceEnabled] = useState(DEFAULTS.geofenceEnabled);
  const [siteAccessPolicy, setSiteAccessPolicy] = useState<SiteAccessPolicy>(
    DEFAULTS.siteAccessPolicy
  );
  const [outsideAreaPolicy, setOutsideAreaPolicy] = useState<OutsideAreaPolicy>(
    DEFAULTS.outsideAreaPolicy
  );
  const [externalPunchEnabled, setExternalPunchEnabled] = useState(
    DEFAULTS.externalPunchEnabled
  );
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleName, setScheduleName] = useState("Jornada Padrao");
  const [scheduleTimezone, setScheduleTimezone] = useState(DEFAULT_SITE_FORM.timezone);
  const [scheduleShiftStart, setScheduleShiftStart] = useState("08:00");
  const [scheduleShiftEnd, setScheduleShiftEnd] = useState("17:00");
  const [scheduleTolerance, setScheduleTolerance] = useState(10);
  const [intervalForms, setIntervalForms] = useState<IntervalFormState[]>(() =>
    buildIntervalForms([])
  );
  const [sites, setSites] = useState<CompanySite[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const canManageBilling = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (!canManageBilling || user?.mode !== "supabase") return;
    let active = true;
    setBillingLoading(true);
    loadBillingStatus()
      .then((result) => {
        if (active) setBilling(result);
      })
      .catch((error) => {
        if (active) setBillingError(error instanceof Error ? error.message : "Falha na cobranca.");
      })
      .finally(() => {
        if (active) setBillingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageBilling, user?.mode]);

  const handleBillingAction = async (action: "checkout" | "portal") => {
    setBillingError(null);
    setBillingLoading(true);
    try {
      await (action === "checkout" ? openStripeCheckout() : openStripePortal());
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Falha na cobranca.");
      setBillingLoading(false);
    }
  };
  const [isSaving, setIsSaving] = useState(false);

  const [currentPeriodId, setCurrentPeriodId] = useState(getCurrentPeriodId());
  const [currentPeriodClosed, setCurrentPeriodClosed] = useState(false);
  const [closedPeriods, setClosedPeriods] = useState(() => readClosedPeriods());

  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteForm, setSiteForm] = useState<SiteFormState>(DEFAULT_SITE_FORM);
  const [siteFormError, setSiteFormError] = useState<string | null>(null);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const activeSites = useMemo(() => sites.filter((site) => site.isActive), [sites]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const [settings, loadedSites, schedules] = await Promise.all([
        loadCompanySettings(user?.id, scopedCompanyId),
        loadCompanySites(user?.id, scopedCompanyId),
        loadWorkSchedules(user?.id, scopedCompanyId)
      ]);
      if (!mounted) return;
      setMode(settings.mode);
      setWorkHours(settings.workHours);
      setTolerance(settings.tolerance);
      setGeofenceEnabled(settings.geofenceEnabled);
      setSiteAccessPolicy(settings.siteAccessPolicy);
      setOutsideAreaPolicy(settings.outsideAreaPolicy);
      setExternalPunchEnabled(settings.externalPunchEnabled);
      setSites(loadedSites);

      const defaultSchedule =
        schedules.find((schedule) => schedule.isDefault) ?? schedules[0] ?? null;
      if (defaultSchedule) {
        setScheduleId(defaultSchedule.id);
        setScheduleName(defaultSchedule.name);
        setScheduleTimezone(defaultSchedule.timezone);
        setScheduleShiftStart(defaultSchedule.shiftStart);
        setScheduleShiftEnd(defaultSchedule.shiftEnd);
        setScheduleTolerance(defaultSchedule.defaultToleranceMin);
        const intervals = await loadWorkIntervals(defaultSchedule.id, user?.id, scopedCompanyId);
        if (!mounted) return;
        setIntervalForms(buildIntervalForms(intervals));
      } else {
        setScheduleId(null);
        setIntervalForms(buildIntervalForms([]));
      }
    };
    void refresh();

    const period = getCurrentPeriodId();
    setCurrentPeriodId(period);
    setCurrentPeriodClosed(isPeriodClosed(period));
    setClosedPeriods(readClosedPeriods());
    return () => {
      mounted = false;
    };
  }, [scopedCompanyId, user?.id]);

  useEffect(() => {
    if (!openSiteModalOnEntry) return;
    setEditingSiteId(null);
    setSiteForm(DEFAULT_SITE_FORM);
    setSiteFormError(null);
    setIsSiteModalOpen(true);
    navigate(location.pathname, {
      replace: true,
      state:
        scopedCompanyId || scopedCompanyName
          ? {
              companyId: scopedCompanyId ?? undefined,
              companyName: scopedCompanyName ?? undefined
            }
          : null
    });
  }, [location.pathname, navigate, openSiteModalOnEntry, scopedCompanyId, scopedCompanyName]);

  const openCreateSiteModal = () => {
    setEditingSiteId(null);
    setSiteForm(DEFAULT_SITE_FORM);
    setSiteFormError(null);
    setIsSiteModalOpen(true);
  };

  const handleToggleGeofence = () => {
    if (!geofenceEnabled && activeSites.length === 0) {
      setFeedback("Cadastre ao menos uma filial ativa para habilitar a geofence.");
      return;
    }
    setGeofenceEnabled((prev) => !prev);
  };

  const openEditSiteModal = (site: CompanySite) => {
    setEditingSiteId(site.id);
    setSiteForm({
      name: site.name,
      addressLine: site.addressLine,
      city: site.city,
      state: site.state,
      postalCode: site.postalCode,
      country: site.country,
      radiusMeters: String(site.radiusMeters),
      timezone: site.timezone,
      lat: String(site.lat),
      lng: String(site.lng)
    });
    setSiteFormError(null);
    setIsSiteModalOpen(true);
  };

  const closeSiteModal = () => {
    if (isSavingSite || isResolvingAddress) return;
    setIsSiteModalOpen(false);
    setEditingSiteId(null);
    setSiteForm(DEFAULT_SITE_FORM);
    setSiteFormError(null);
  };

  const handleResolveAddress = async () => {
    const query = [
      siteForm.addressLine,
      siteForm.city,
      siteForm.state,
      siteForm.postalCode,
      siteForm.country
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(", ");

    if (query.length < 5) {
      setSiteFormError("Informe um endereco mais completo.");
      return;
    }

    setSiteFormError(null);
    setIsResolvingAddress(true);
    const result = await geocodeAddress(query);
    setIsResolvingAddress(false);
    if (!result) {
      setSiteFormError("Nao foi possivel localizar o endereco.");
      return;
    }

    setSiteForm((prev) => ({
      ...prev,
      lat: String(result.lat),
      lng: String(result.lng),
      city: prev.city || result.city,
      state: prev.state || result.state,
      postalCode: prev.postalCode || result.postalCode,
      country: prev.country || result.country
    }));
  };

  const handleSaveSite = async () => {
    const normalized = normalizeSiteForm(siteForm);
    if (!normalized) {
      setSiteFormError("Preencha dados validos da filial e coordenadas.");
      return;
    }

    setIsSavingSite(true);
    setSiteFormError(null);

    if (editingSiteId) {
      const result = await updateCompanySite(user?.id, editingSiteId, normalized, scopedCompanyId);
      if (!result) {
        setIsSavingSite(false);
        setSiteFormError("Nao foi possivel atualizar a filial.");
        return;
      }
      appendAuditLog({
        companyId: scopedCompanyId ?? undefined,
        actorId: user?.id,
        action: "company_site_updated",
        entityType: "company_site",
        entityId: result.site.id
      });
      setFeedback(result.synced ? "Filial atualizada." : "Filial atualizada localmente.");
    } else {
      const result = await createCompanySite(user?.id, normalized, scopedCompanyId);
      appendAuditLog({
        companyId: scopedCompanyId ?? undefined,
        actorId: user?.id,
        action: "company_site_created",
        entityType: "company_site",
        entityId: result.site.id
      });
      setFeedback(result.synced ? "Filial cadastrada." : "Filial cadastrada localmente.");
    }

    setSites(await loadCompanySites(user?.id, scopedCompanyId));
    setIsSavingSite(false);
    closeSiteModal();
  };

  const handleToggleSiteActive = async (site: CompanySite) => {
    if (site.isActive && geofenceEnabled && activeSites.length === 1) {
      setFeedback("Mantenha ao menos uma filial ativa com geofence habilitada.");
      return;
    }
    const result = await setCompanySiteActive(user?.id, site.id, !site.isActive, scopedCompanyId);
    if (!result) {
      setFeedback("Nao foi possivel alterar o status da filial.");
      return;
    }
    setSites(await loadCompanySites(user?.id, scopedCompanyId));
  };

  const handleSaveSettings = async () => {
    if (!Number.isFinite(workHours) || workHours <= 0 || workHours > 24) {
      setFeedback("Jornada diaria invalida (1 a 24 horas).");
      return;
    }
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 180) {
      setFeedback("Tolerancia invalida (0 a 180 minutos).");
      return;
    }
    if (geofenceEnabled && activeSites.length === 0) {
      setFeedback("Cadastre ao menos uma filial ativa para geofence.");
      return;
    }

    const normalizedScheduleName = cleanText(scheduleName || "Jornada Padrao");
    const normalizedTimezone = cleanText(scheduleTimezone || DEFAULT_SITE_FORM.timezone);
    if (!normalizedScheduleName) {
      setFeedback("Informe um nome valido para a jornada.");
      return;
    }
    if (!scheduleShiftStart || !scheduleShiftEnd) {
      setFeedback("Informe horario de inicio e fim da jornada.");
      return;
    }
    if (!Number.isFinite(scheduleTolerance) || scheduleTolerance < 0 || scheduleTolerance > 180) {
      setFeedback("Tolerancia da jornada invalida (0 a 180 minutos).");
      return;
    }

    const mainSite = activeSites[0] ?? sites[0] ?? null;
    setIsSaving(true);

    const savedSchedule = await saveWorkSchedule(user?.id, {
      id: scheduleId ?? undefined,
      name: normalizedScheduleName,
      timezone: normalizedTimezone,
      shiftStart: scheduleShiftStart,
      shiftEnd: scheduleShiftEnd,
      defaultToleranceMin: scheduleTolerance,
      isDefault: true
    }, scopedCompanyId);

    if (!savedSchedule) {
      setIsSaving(false);
      setFeedback("Nao foi possivel salvar a jornada.");
      return;
    }

    setScheduleId(savedSchedule.id);
    const enabledIntervals = intervalForms.filter((interval) => interval.enabled);
    const intervalsPayload = enabledIntervals.map((interval) => ({
      id: interval.id,
      type: interval.type,
      windowStart: interval.windowStart,
      windowEnd: interval.windowEnd,
      durationMin: Number(interval.durationMin) || 0,
      toleranceMin: Number(interval.toleranceMin) || 0
    }));

    if (intervalsPayload.some((interval) => interval.durationMin <= 0)) {
      setIsSaving(false);
      setFeedback("Duracao dos intervalos invalida.");
      return;
    }

    await saveWorkIntervals(user?.id, savedSchedule.id, intervalsPayload, scopedCompanyId);

    const result = await saveCompanySettings(user?.id, {
      mode,
      workHours,
      tolerance,
      geofenceEnabled,
      geofenceRadius: mainSite?.radiusMeters ?? 200,
      geofenceLabel: mainSite?.name ?? "Unidade Principal",
      geofenceCenter: geofenceEnabled && mainSite ? { lat: mainSite.lat, lng: mainSite.lng } : null,
      siteAccessPolicy,
      outsideAreaPolicy,
      externalPunchEnabled
    }, scopedCompanyId);

    appendAuditLog({
      companyId: scopedCompanyId ?? undefined,
      actorId: user?.id,
      action: "company_settings_updated",
      entityType: "company_settings",
      entityId: scopedCompanyId ?? "company-settings",
      payload: {
        mode,
        workHours,
        tolerance,
        geofenceEnabled,
        siteAccessPolicy,
        outsideAreaPolicy,
        externalPunchEnabled
      }
    });

    setMode(result.settings.mode);
    setWorkHours(result.settings.workHours);
    setTolerance(result.settings.tolerance);
    setGeofenceEnabled(result.settings.geofenceEnabled);
    setSiteAccessPolicy(result.settings.siteAccessPolicy);
    setOutsideAreaPolicy(result.settings.outsideAreaPolicy);
    setExternalPunchEnabled(result.settings.externalPunchEnabled);
    setIsSaving(false);
    setFeedback(
      result.synced
        ? "Configuracoes salvas e sincronizadas."
        : "Configuracoes salvas localmente."
    );
    navigate(-1);
  };

  const handleToggleCurrentPeriod = () => {
    const shouldClose = !currentPeriodClosed;
    const updated = setPeriodClosed(currentPeriodId, shouldClose, { lockedBy: user?.id });
    setCurrentPeriodClosed(shouldClose);
    setClosedPeriods(updated);
  };

  const recentClosedPeriods = [...closedPeriods]
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark" data-testid="company-settings-page">
      <div className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-surface-dark">
        <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <span className="material-symbols-outlined text-slate-900 dark:text-white">arrow_back</span>
        </button>
        <div className="ml-2 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Configuracoes da Empresa</h1>
          {scopedCompanyName && (
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              Escopo: {scopedCompanyName}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto p-4">
        <div className="mb-6 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("SIMPLE")} className={`rounded-xl border p-3 text-sm font-semibold ${mode === "SIMPLE" ? "border-primary text-primary" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>Modo Simples</button>
            <button type="button" onClick={() => setMode("FULL")} className={`rounded-xl border p-3 text-sm font-semibold ${mode === "FULL" ? "border-primary text-primary" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>Modo Completo</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Jornada (h)
              <input type="number" value={workHours} onChange={(e) => setWorkHours(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-xs text-slate-500">Tolerancia (min)
              <input type="number" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Geofence</p>
            <button type="button" onClick={handleToggleGeofence} className={`h-7 w-14 rounded-full px-1 ${geofenceEnabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"}`}>
              <div className={`h-5 w-5 rounded-full bg-white transition-transform ${geofenceEnabled ? "translate-x-7" : ""}`}></div>
            </button>
          </div>

          <label className="mb-2 block text-xs text-slate-500">
            Acesso a filiais
            <select value={siteAccessPolicy} onChange={(e) => setSiteAccessPolicy(e.target.value as SiteAccessPolicy)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="ANY_SITE">Qualquer filial</option>
              <option value="ASSIGNED_ONLY">Somente filiais atribuidas</option>
            </select>
          </label>

          <label className="mb-2 block text-xs text-slate-500">
            Fora da area
            <select value={outsideAreaPolicy} onChange={(e) => setOutsideAreaPolicy(e.target.value as OutsideAreaPolicy)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="BLOCK_ALWAYS">Bloquear sempre</option>
              <option value="ALLOW_WITH_JUSTIFICATION">Permitir com justificativa</option>
            </select>
          </label>

          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40">
            <span>Permitir home office / visita externa</span>
            <button type="button" onClick={() => setExternalPunchEnabled((prev) => !prev)} className={`h-7 w-14 rounded-full px-1 ${externalPunchEnabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"}`}>
              <div className={`h-5 w-5 rounded-full bg-white transition-transform ${externalPunchEnabled ? "translate-x-7" : ""}`}></div>
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Jornada e Intervalos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure o horario padrao de trabalho e os intervalos.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Nome da jornada
              <input
                type="text"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              Timezone
              <input
                type="text"
                value={scheduleTimezone}
                onChange={(e) => setScheduleTimezone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Inicio do turno
              <input
                type="time"
                value={scheduleShiftStart}
                onChange={(e) => setScheduleShiftStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              Fim do turno
              <input
                type="time"
                value={scheduleShiftEnd}
                onChange={(e) => setScheduleShiftEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <div className="mt-3">
            <label className="text-xs text-slate-500">
              Tolerancia padrao (min)
              <input
                type="number"
                value={scheduleTolerance}
                onChange={(e) => setScheduleTolerance(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {intervalForms.map((interval) => (
              <div key={interval.type} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {intervalTypeLabel(interval.type)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setIntervalForms((prev) =>
                        prev.map((item) =>
                          item.type === interval.type ? { ...item, enabled: !item.enabled } : item
                        )
                      )
                    }
                    className={`h-7 w-14 rounded-full px-1 ${interval.enabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"}`}
                  >
                    <div
                      className={`h-5 w-5 rounded-full bg-white transition-transform ${interval.enabled ? "translate-x-7" : ""}`}
                    ></div>
                  </button>
                </div>
                {interval.enabled && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-500">
                      Inicio
                      <input
                        type="time"
                        value={interval.windowStart}
                        onChange={(e) =>
                          setIntervalForms((prev) =>
                            prev.map((item) =>
                              item.type === interval.type ? { ...item, windowStart: e.target.value } : item
                            )
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Fim
                      <input
                        type="time"
                        value={interval.windowEnd}
                        onChange={(e) =>
                          setIntervalForms((prev) =>
                            prev.map((item) =>
                              item.type === interval.type ? { ...item, windowEnd: e.target.value } : item
                            )
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Duracao (min)
                      <input
                        type="number"
                        value={interval.durationMin}
                        onChange={(e) =>
                          setIntervalForms((prev) =>
                            prev.map((item) =>
                              item.type === interval.type ? { ...item, durationMin: e.target.value } : item
                            )
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Tolerancia (min)
                      <input
                        type="number"
                        value={interval.toleranceMin}
                        onChange={(e) =>
                          setIntervalForms((prev) =>
                            prev.map((item) =>
                              item.type === interval.type ? { ...item, toleranceMin: e.target.value } : item
                            )
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filiais</h3>
          <button type="button" onClick={openCreateSiteModal} data-testid="company-settings-add-site-button" className="rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-blue-50 dark:hover:bg-slate-800">+ Nova</button>
        </div>

        <div className="mb-6 space-y-2">
          {sites.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              Nenhuma filial cadastrada.
            </div>
          )}
          {sites.map((site) => (
            <div key={site.id} className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{site.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{site.addressLine}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{site.city} {site.state}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Raio {site.radiusMeters}m • {site.timezone}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${site.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{site.isActive ? "Ativa" : "Inativa"}</span>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => openEditSiteModal(site)} data-testid={`company-settings-edit-site-${site.id}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Editar</button>
                <button type="button" onClick={() => void handleToggleSiteActive(site)} data-testid={`company-settings-toggle-site-${site.id}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">{site.isActive ? "Desativar" : "Ativar"}</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Periodo atual: {formatPeriodLabel(currentPeriodId)}</p>
              <p className="text-xs text-slate-500">{currentPeriodClosed ? "Fechado" : "Aberto"}</p>
            </div>
            <button type="button" onClick={handleToggleCurrentPeriod} className={`rounded-lg px-3 py-2 text-xs font-bold ${currentPeriodClosed ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{currentPeriodClosed ? "Reabrir" : "Fechar"}</button>
          </div>
          {recentClosedPeriods.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recentClosedPeriods.map((entry) => (
                <span key={entry.period} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">{formatPeriodLabel(entry.period)}</span>
              ))}
            </div>
          )}
        </div>

        {canManageBilling && user?.mode === "supabase" && (
          <div className="mb-6 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" data-testid="company-settings-billing">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Plano e cobranca</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {billingLoading
                ? "Consultando Stripe..."
                : billing?.subscription
                  ? `Status: ${billing.subscription.status}${billing.subscription.cancelAtPeriodEnd ? " (cancelamento agendado)" : ""}`
                  : billing?.enabled
                    ? "Nenhuma assinatura ativa."
                    : "Cobranca ainda nao habilitada."}
            </p>
            {billing?.subscription?.currentPeriodEnd && (
              <p className="mt-1 text-xs text-slate-500">
                Ciclo ate {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
              </p>
            )}
            {billingError && <p className="mt-2 text-xs font-medium text-rose-600">{billingError}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={billingLoading || !billing?.enabled} onClick={() => void handleBillingAction("checkout")} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                Assinar ou alterar
              </button>
              {billing?.subscription && (
                <button type="button" disabled={billingLoading || !billing.enabled} onClick={() => void handleBillingAction("portal")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                  Gerenciar cobranca
                </button>
              )}
            </div>
          </div>
        )}

        {feedback && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">{feedback}</div>
        )}

        <button onClick={() => void handleSaveSettings()} disabled={isSaving} data-testid="company-settings-save-button" className="w-full rounded-xl bg-primary py-4 font-bold text-white hover:bg-blue-600 disabled:opacity-70">
          {isSaving ? "Salvando..." : "Salvar Configuracoes"}
        </button>
      </div>

      {isSiteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="company-settings-site-modal-overlay">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800" data-testid="company-settings-site-modal">
            <h3 className="mb-3 text-base font-bold text-slate-900 dark:text-white">{editingSiteId ? "Editar filial" : "Nova filial"}</h3>
            <div className="grid grid-cols-1 gap-2">
              <input value={siteForm.name} onChange={(e) => setSiteForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nome da filial" data-testid="company-settings-site-name-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              <input value={siteForm.addressLine} onChange={(e) => setSiteForm((prev) => ({ ...prev, addressLine: e.target.value }))} placeholder="Endereco" data-testid="company-settings-site-address-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              <div className="grid grid-cols-2 gap-2">
                <input value={siteForm.city} onChange={(e) => setSiteForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Cidade" data-testid="company-settings-site-city-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                <input value={siteForm.state} onChange={(e) => setSiteForm((prev) => ({ ...prev, state: e.target.value }))} placeholder="Estado" data-testid="company-settings-site-state-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={siteForm.postalCode} onChange={(e) => setSiteForm((prev) => ({ ...prev, postalCode: e.target.value }))} placeholder="CEP" data-testid="company-settings-site-postal-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                <input value={siteForm.country} onChange={(e) => setSiteForm((prev) => ({ ...prev, country: e.target.value }))} placeholder="Pais" data-testid="company-settings-site-country-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={siteForm.radiusMeters} onChange={(e) => setSiteForm((prev) => ({ ...prev, radiusMeters: e.target.value }))} placeholder="Raio (m)" data-testid="company-settings-site-radius-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                <input value={siteForm.timezone} onChange={(e) => setSiteForm((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="Timezone" data-testid="company-settings-site-timezone-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <button type="button" onClick={() => void handleResolveAddress()} disabled={isResolvingAddress} data-testid="company-settings-resolve-address-button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-70 dark:border-slate-700 dark:text-slate-300">
                {isResolvingAddress ? "Localizando..." : "Buscar coordenadas por endereco"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <input value={siteForm.lat} onChange={(e) => setSiteForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" data-testid="company-settings-site-lat-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                <input value={siteForm.lng} onChange={(e) => setSiteForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" data-testid="company-settings-site-lng-input" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              {siteFormError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300" data-testid="company-settings-site-error">{siteFormError}</p>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={closeSiteModal} data-testid="company-settings-site-cancel-button" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancelar</button>
              <button type="button" onClick={() => void handleSaveSite()} disabled={isSavingSite || isResolvingAddress} data-testid="company-settings-site-save-button" className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70">{isSavingSite ? "Salvando..." : "Salvar filial"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
