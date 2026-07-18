import { resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const MODE_KEY = "portal.company.mode";
const WORK_HOURS_KEY = "portal.company.workHours";
const TOLERANCE_KEY = "portal.company.tolerance";
const GEO_ENABLED_KEY = "portal.company.geofenceEnabled";
const GEO_RADIUS_KEY = "portal.company.geofenceRadius";
const GEO_LABEL_KEY = "portal.company.geofenceLabel";
const GEO_LAT_KEY = "portal.company.geofenceLat";
const GEO_LNG_KEY = "portal.company.geofenceLng";
const SITE_ACCESS_POLICY_KEY = "portal.company.siteAccessPolicy";
const OUTSIDE_AREA_POLICY_KEY = "portal.company.outsideAreaPolicy";
const EXTERNAL_PUNCH_ENABLED_KEY = "portal.company.externalPunchEnabled";

export type TrackingMode = "SIMPLE" | "FULL";
export type SiteAccessPolicy = "ANY_SITE" | "ASSIGNED_ONLY";
export type OutsideAreaPolicy = "BLOCK_ALWAYS" | "ALLOW_WITH_JUSTIFICATION";

export type GeofenceCenter = {
  lat: number;
  lng: number;
};

export type CompanySettings = {
  mode: TrackingMode;
  workHours: number;
  tolerance: number;
  geofenceEnabled: boolean;
  geofenceRadius: number;
  geofenceLabel: string;
  geofenceCenter: GeofenceCenter | null;
  siteAccessPolicy: SiteAccessPolicy;
  outsideAreaPolicy: OutsideAreaPolicy;
  externalPunchEnabled: boolean;
};

export type SaveCompanySettingsResult = {
  settings: CompanySettings;
  synced: boolean;
};

const DEFAULT_SETTINGS: CompanySettings = {
  mode: "FULL",
  workHours: 8,
  tolerance: 10,
  geofenceEnabled: false,
  geofenceRadius: 200,
  geofenceLabel: "Unidade Principal",
  geofenceCenter: null,
  siteAccessPolicy: "ASSIGNED_ONLY",
  outsideAreaPolicy: "BLOCK_ALWAYS",
  externalPunchEnabled: false
};

type GeofenceRow = {
  id: string;
  label: string;
  lat: number | string;
  lng: number | string;
  radius_meters: number | null;
  created_at: string;
};

function parseMode(value: string | null): TrackingMode {
  return value === "SIMPLE" ? "SIMPLE" : "FULL";
}

function parseWorkHours(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24) return DEFAULT_SETTINGS.workHours;
  return parsed;
}

function parseTolerance(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 180) return DEFAULT_SETTINGS.tolerance;
  return Math.round(parsed);
}

function parseGeofenceRadius(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 20 || parsed > 5000) return DEFAULT_SETTINGS.geofenceRadius;
  return Math.round(parsed);
}

function parseNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseGeofenceCenter(latRaw: string | null, lngRaw: string | null): GeofenceCenter | null {
  const lat = parseNumber(latRaw);
  const lng = parseNumber(lngRaw);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function normalizeGeofenceCenter(center: GeofenceCenter | null): GeofenceCenter | null {
  if (!center) return null;
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseSiteAccessPolicy(value: string | null): SiteAccessPolicy {
  if (value === "ASSIGNED_ONLY") return "ASSIGNED_ONLY";
  if (value === "ANY_SITE") return "ANY_SITE";
  return DEFAULT_SETTINGS.siteAccessPolicy;
}

function parseOutsideAreaPolicy(value: string | null): OutsideAreaPolicy {
  return value === "ALLOW_WITH_JUSTIFICATION"
    ? "ALLOW_WITH_JUSTIFICATION"
    : "BLOCK_ALWAYS";
}

export function readCachedCompanySettings(): CompanySettings {
  try {
    const mode = parseMode(localStorage.getItem(MODE_KEY));
    const workHours = parseWorkHours(localStorage.getItem(WORK_HOURS_KEY));
    const tolerance = parseTolerance(localStorage.getItem(TOLERANCE_KEY));
    const geofenceEnabled = parseBoolean(localStorage.getItem(GEO_ENABLED_KEY));
    const geofenceRadius = parseGeofenceRadius(localStorage.getItem(GEO_RADIUS_KEY));
    const geofenceLabel =
      localStorage.getItem(GEO_LABEL_KEY)?.trim() || DEFAULT_SETTINGS.geofenceLabel;
    const geofenceCenter = parseGeofenceCenter(
      localStorage.getItem(GEO_LAT_KEY),
      localStorage.getItem(GEO_LNG_KEY)
    );
    const siteAccessPolicy = parseSiteAccessPolicy(
      localStorage.getItem(SITE_ACCESS_POLICY_KEY)
    );
    const outsideAreaPolicy = parseOutsideAreaPolicy(
      localStorage.getItem(OUTSIDE_AREA_POLICY_KEY)
    );
    const externalPunchEnabled = parseBoolean(
      localStorage.getItem(EXTERNAL_PUNCH_ENABLED_KEY)
    );
    return {
      mode,
      workHours,
      tolerance,
      geofenceEnabled,
      geofenceRadius,
      geofenceLabel,
      geofenceCenter,
      siteAccessPolicy,
      outsideAreaPolicy,
      externalPunchEnabled
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeCachedCompanySettings(settings: CompanySettings): CompanySettings {
  const normalized: CompanySettings = {
    mode: settings.mode === "SIMPLE" ? "SIMPLE" : "FULL",
    workHours: parseWorkHours(String(settings.workHours)),
    tolerance: parseTolerance(String(settings.tolerance)),
    geofenceEnabled: Boolean(settings.geofenceEnabled),
    geofenceRadius: parseGeofenceRadius(String(settings.geofenceRadius)),
    geofenceLabel: settings.geofenceLabel.trim() || DEFAULT_SETTINGS.geofenceLabel,
    geofenceCenter: normalizeGeofenceCenter(settings.geofenceCenter),
    siteAccessPolicy:
      settings.siteAccessPolicy === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : "ANY_SITE",
    outsideAreaPolicy:
      settings.outsideAreaPolicy === "ALLOW_WITH_JUSTIFICATION"
        ? "ALLOW_WITH_JUSTIFICATION"
        : "BLOCK_ALWAYS",
    externalPunchEnabled: Boolean(settings.externalPunchEnabled)
  };

  localStorage.setItem(MODE_KEY, normalized.mode);
  localStorage.setItem(WORK_HOURS_KEY, String(normalized.workHours));
  localStorage.setItem(TOLERANCE_KEY, String(normalized.tolerance));
  localStorage.setItem(GEO_ENABLED_KEY, String(normalized.geofenceEnabled));
  localStorage.setItem(GEO_RADIUS_KEY, String(normalized.geofenceRadius));
  localStorage.setItem(GEO_LABEL_KEY, normalized.geofenceLabel);
  localStorage.setItem(SITE_ACCESS_POLICY_KEY, normalized.siteAccessPolicy);
  localStorage.setItem(OUTSIDE_AREA_POLICY_KEY, normalized.outsideAreaPolicy);
  localStorage.setItem(
    EXTERNAL_PUNCH_ENABLED_KEY,
    String(normalized.externalPunchEnabled)
  );
  if (normalized.geofenceCenter) {
    localStorage.setItem(GEO_LAT_KEY, String(normalized.geofenceCenter.lat));
    localStorage.setItem(GEO_LNG_KEY, String(normalized.geofenceCenter.lng));
  } else {
    localStorage.removeItem(GEO_LAT_KEY);
    localStorage.removeItem(GEO_LNG_KEY);
  }

  return normalized;
}

function mapDbToSettings(data: {
  time_tracking_mode: TrackingMode;
  work_hours: number | string;
  tolerance_minutes: number;
  geofence_enabled?: boolean;
  geofence_radius?: number | null;
  site_access_policy?: SiteAccessPolicy | null;
  outside_area_policy?: OutsideAreaPolicy | null;
  external_punch_enabled?: boolean | null;
}): CompanySettings {
  const cached = readCachedCompanySettings();
  return {
    mode: data.time_tracking_mode === "SIMPLE" ? "SIMPLE" : "FULL",
    workHours: parseWorkHours(String(data.work_hours)),
    tolerance: parseTolerance(String(data.tolerance_minutes)),
    geofenceEnabled:
      typeof data.geofence_enabled === "boolean"
        ? data.geofence_enabled
        : cached.geofenceEnabled,
    geofenceRadius:
      typeof data.geofence_radius === "number"
        ? parseGeofenceRadius(String(data.geofence_radius))
        : cached.geofenceRadius,
    geofenceLabel: cached.geofenceLabel,
    geofenceCenter: cached.geofenceCenter,
    siteAccessPolicy:
      data.site_access_policy === "ASSIGNED_ONLY"
        ? "ASSIGNED_ONLY"
        : data.site_access_policy === "ANY_SITE"
          ? "ANY_SITE"
          : cached.siteAccessPolicy,
    outsideAreaPolicy:
      data.outside_area_policy === "ALLOW_WITH_JUSTIFICATION"
        ? "ALLOW_WITH_JUSTIFICATION"
        : "BLOCK_ALWAYS",
    externalPunchEnabled:
      typeof data.external_punch_enabled === "boolean"
        ? data.external_punch_enabled
        : cached.externalPunchEnabled
  };
}

async function loadRemoteGeofence(companyId: string): Promise<{
  label: string;
  center: GeofenceCenter;
  radius: number;
} | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("geofences")
    .select("id, label, lat, lng, radius_meters, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0] as GeofenceRow;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const center = normalizeGeofenceCenter({ lat, lng });
  if (!center) return null;
  return {
    label: row.label || DEFAULT_SETTINGS.geofenceLabel,
    center,
    radius:
      typeof row.radius_meters === "number"
        ? parseGeofenceRadius(String(row.radius_meters))
        : DEFAULT_SETTINGS.geofenceRadius
  };
}

export async function loadCompanySettings(
  userId: string | null | undefined,
  companyIdOverride?: string | null
): Promise<CompanySettings> {
  const cached = readCachedCompanySettings();
  if (!supabase) return cached;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return cached;

  const { data, error } = await supabase
    .from("company_settings")
    .select(
      "time_tracking_mode, work_hours, tolerance_minutes, geofence_enabled, geofence_radius, site_access_policy, outside_area_policy, external_punch_enabled"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return cached;

  const base = mapDbToSettings({
    time_tracking_mode: data.time_tracking_mode as TrackingMode,
    work_hours: data.work_hours as number | string,
    tolerance_minutes: data.tolerance_minutes as number,
    geofence_enabled: data.geofence_enabled as boolean | undefined,
    geofence_radius: data.geofence_radius as number | null | undefined,
    site_access_policy: data.site_access_policy as SiteAccessPolicy | null | undefined,
    outside_area_policy: data.outside_area_policy as OutsideAreaPolicy | null | undefined,
    external_punch_enabled: data.external_punch_enabled as boolean | null | undefined
  });

  const geofence = await loadRemoteGeofence(companyId);
  const merged = writeCachedCompanySettings({
    ...base,
    geofenceLabel: geofence?.label ?? base.geofenceLabel,
    geofenceCenter: geofence?.center ?? base.geofenceCenter,
    geofenceRadius: geofence?.radius ?? base.geofenceRadius
  });
  return merged;
}

async function upsertRemoteGeofence(
  companyId: string,
  settings: CompanySettings
): Promise<boolean> {
  if (!supabase) return false;
  if (!settings.geofenceCenter) return true;

  const { data: existing, error: selectError } = await supabase
    .from("geofences")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (selectError) return false;
  const existingId = Array.isArray(existing) && existing.length > 0 ? existing[0]?.id : null;

  if (existingId) {
    const { error: updateError } = await supabase
      .from("geofences")
      .update({
        label: settings.geofenceLabel,
        lat: settings.geofenceCenter.lat,
        lng: settings.geofenceCenter.lng,
        radius_meters: settings.geofenceRadius
      })
      .eq("id", existingId);
    return !updateError;
  }

  const { error: insertError } = await supabase.from("geofences").insert({
    company_id: companyId,
    label: settings.geofenceLabel,
    lat: settings.geofenceCenter.lat,
    lng: settings.geofenceCenter.lng,
    radius_meters: settings.geofenceRadius
  });
  return !insertError;
}

export async function saveCompanySettings(
  userId: string | null | undefined,
  settings: CompanySettings,
  companyIdOverride?: string | null
): Promise<SaveCompanySettingsResult> {
  const base = readCachedCompanySettings();
  const mergedInput: CompanySettings = {
    ...base,
    ...settings
  };
  const normalized = writeCachedCompanySettings(mergedInput);
  if (!supabase) {
    return { settings: normalized, synced: false };
  }

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) {
    return { settings: normalized, synced: false };
  }

  const settingsUpsert = await supabase.from("company_settings").upsert(
    {
      company_id: companyId,
      time_tracking_mode: normalized.mode,
      work_hours: normalized.workHours,
      tolerance_minutes: normalized.tolerance,
      geofence_enabled: normalized.geofenceEnabled,
      geofence_radius: normalized.geofenceRadius,
      site_access_policy: normalized.siteAccessPolicy,
      outside_area_policy: normalized.outsideAreaPolicy,
      external_punch_enabled: normalized.externalPunchEnabled,
      updated_at: new Date().toISOString()
    },
    { onConflict: "company_id" }
  );

  if (settingsUpsert.error) {
    return { settings: normalized, synced: false };
  }

  const geofenceSynced = await upsertRemoteGeofence(companyId, normalized);
  return {
    settings: normalized,
    synced: geofenceSynced
  };
}
