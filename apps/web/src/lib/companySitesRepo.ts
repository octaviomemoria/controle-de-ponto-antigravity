import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const COMPANY_SITES_KEY = "portal.company.sites";

const DEFAULT_RADIUS_METERS = 200;
const MIN_RADIUS_METERS = 20;
const MAX_RADIUS_METERS = 5000;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_COUNTRY = "BR";

export type CompanySite = {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  timezone: string;
  isActive: boolean;
};

export type SaveCompanySiteInput = {
  name: string;
  addressLine: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  timezone?: string;
};

export type CompanySiteMutationResult = {
  site: CompanySite;
  synced: boolean;
};

export type GeocodeAddressResult = {
  lat: number;
  lng: number;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  displayName: string;
};

type DbCompanySite = {
  id: string;
  name: string;
  address_line: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | string;
  lng: number | string;
  radius_meters: number | null;
  timezone: string | null;
  is_active: boolean | null;
  created_at: string;
};

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeRadius(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_METERS;
  if (parsed < MIN_RADIUS_METERS) return MIN_RADIUS_METERS;
  if (parsed > MAX_RADIUS_METERS) return MAX_RADIUS_METERS;
  return Math.round(parsed);
}

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

function normalizeTimezone(value: unknown): string {
  return normalizeText(value, DEFAULT_TIMEZONE);
}

function normalizeCountry(value: unknown): string {
  const normalized = normalizeText(value, DEFAULT_COUNTRY).toUpperCase();
  return normalized || DEFAULT_COUNTRY;
}

function normalizeCoordinates(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  const lat = parseNumber(latRaw);
  const lng = parseNumber(lngRaw);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

function generateLocalSiteId(): string {
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSeedSites(): CompanySite[] {
  return [
    {
      id: "site-seed-a",
      name: "Site A - Teste",
      addressLine: "Av. Paulista, 1000",
      city: "Sao Paulo",
      state: "SP",
      postalCode: "01310-100",
      country: DEFAULT_COUNTRY,
      lat: -23.561399,
      lng: -46.655881,
      radiusMeters: 200,
      timezone: DEFAULT_TIMEZONE,
      isActive: true
    }
  ];
}

function parseLegacySite(): CompanySite | null {
  try {
    const lat = parseNumber(localStorage.getItem("portal.company.geofenceLat"));
    const lng = parseNumber(localStorage.getItem("portal.company.geofenceLng"));
    const geofenceEnabled = localStorage.getItem("portal.company.geofenceEnabled") === "true";
    if (!geofenceEnabled || lat === null || lng === null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const name = normalizeText(localStorage.getItem("portal.company.geofenceLabel"), "Unidade Principal");
    const radius = normalizeRadius(localStorage.getItem("portal.company.geofenceRadius"));
    const timezone = normalizeTimezone(localStorage.getItem("portal.company.timezone"));

    return {
      id: "site-legacy-main",
      name,
      addressLine: "Endereco nao informado",
      city: "",
      state: "",
      postalCode: "",
      country: DEFAULT_COUNTRY,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      radiusMeters: radius,
      timezone,
      isActive: true
    };
  } catch {
    return null;
  }
}

function normalizeSite(
  input: Partial<Omit<CompanySite, "lat" | "lng">> & { lat?: unknown; lng?: unknown }
): CompanySite | null {
  const id = normalizeText(input.id, generateLocalSiteId());
  const name = normalizeText(input.name, "Filial");
  const addressLine = normalizeText(input.addressLine, "Endereco nao informado");
  const coords = normalizeCoordinates(input.lat, input.lng);
  if (!coords) return null;
  return {
    id,
    name,
    addressLine,
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    postalCode: normalizeText(input.postalCode),
    country: normalizeCountry(input.country),
    lat: coords.lat,
    lng: coords.lng,
    radiusMeters: normalizeRadius(input.radiusMeters),
    timezone: normalizeTimezone(input.timezone),
    isActive: Boolean(input.isActive ?? true)
  };
}

function parseSiteArray(raw: string | null): CompanySite[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        return normalizeSite(item as Partial<CompanySite>);
      })
      .filter((item): item is CompanySite => item !== null);
  } catch {
    return [];
  }
}

function dedupeSitesById(sites: CompanySite[]): CompanySite[] {
  const byId = new Map<string, CompanySite>();
  sites.forEach((site) => byId.set(site.id, site));
  return Array.from(byId.values());
}

function sortSites(sites: CompanySite[]): CompanySite[] {
  return [...sites].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function writeCachedCompanySites(sites: CompanySite[]): CompanySite[] {
  const normalized = sortSites(dedupeSitesById(sites));
  localStorage.setItem(COMPANY_SITES_KEY, JSON.stringify(normalized));
  return normalized;
}

export function readCachedCompanySites(): CompanySite[] {
  try {
    const cached = parseSiteArray(localStorage.getItem(COMPANY_SITES_KEY));
    if (cached.length > 0) return sortSites(cached);
    const legacy = parseLegacySite();
    if (legacy) return writeCachedCompanySites([legacy]);
    return writeCachedCompanySites(buildSeedSites());
  } catch {
    return [];
  }
}

function mapDbSiteToLocal(site: DbCompanySite): CompanySite | null {
  return normalizeSite({
    id: site.id,
    name: site.name,
    addressLine: site.address_line,
    city: site.city ?? "",
    state: site.state ?? "",
    postalCode: site.postal_code ?? "",
    country: site.country ?? DEFAULT_COUNTRY,
    lat: site.lat,
    lng: site.lng,
    radiusMeters: site.radius_meters ?? DEFAULT_RADIUS_METERS,
    timezone: site.timezone ?? DEFAULT_TIMEZONE,
    isActive: site.is_active ?? true
  });
}

function mapLocalSiteToDb(site: CompanySite, companyId: string): Omit<DbCompanySite, "id" | "created_at"> & {
  company_id: string;
} {
  return {
    company_id: companyId,
    name: site.name,
    address_line: site.addressLine,
    city: site.city || null,
    state: site.state || null,
    postal_code: site.postalCode || null,
    country: site.country,
    lat: site.lat,
    lng: site.lng,
    radius_meters: site.radiusMeters,
    timezone: site.timezone,
    is_active: site.isActive
  };
}

function mergeSites(localSites: CompanySite[], remoteSites: CompanySite[]): CompanySite[] {
  const merged = new Map<string, CompanySite>();
  localSites.forEach((site) => merged.set(site.id, site));
  remoteSites.forEach((site) => merged.set(site.id, site));
  return sortSites(Array.from(merged.values()));
}

export async function loadCompanySites(
  userId?: string,
  companyIdOverride?: string | null
): Promise<CompanySite[]> {
  const cached = readCachedCompanySites();
  if (!supabase) return cached;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return cached;

  const { data, error } = await supabase
    .from("company_sites")
    .select(
      "id, name, address_line, city, state, postal_code, country, lat, lng, radius_meters, timezone, is_active, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error || !data) return cached;

  const remoteSites = (data as DbCompanySite[])
    .map(mapDbSiteToLocal)
    .filter((site): site is CompanySite => site !== null);

  const merged = mergeSites(cached, remoteSites);
  writeCachedCompanySites(merged);
  return merged;
}

export async function createCompanySite(
  userId: string | null | undefined,
  input: SaveCompanySiteInput,
  companyIdOverride?: string | null
): Promise<CompanySiteMutationResult> {
  const coords = normalizeCoordinates(input.lat, input.lng);
  if (!coords) {
    throw new Error("Coordenadas invalidas para a filial.");
  }

  const localSite: CompanySite = {
    id: generateLocalSiteId(),
    name: normalizeText(input.name, "Filial"),
    addressLine: normalizeText(input.addressLine, "Endereco nao informado"),
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    postalCode: normalizeText(input.postalCode),
    country: normalizeCountry(input.country),
    lat: coords.lat,
    lng: coords.lng,
    radiusMeters: normalizeRadius(input.radiusMeters),
    timezone: normalizeTimezone(input.timezone),
    isActive: true
  };

  const localNext = writeCachedCompanySites([...readCachedCompanySites(), localSite]);
  const insertedLocal = localNext.find((site) => site.id === localSite.id) ?? localSite;

  if (!supabase) return { site: insertedLocal, synced: false };

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return { site: insertedLocal, synced: false };

  const payload = mapLocalSiteToDb(insertedLocal, companyId);
  const { data, error } = await supabase
    .from("company_sites")
    .insert(payload)
    .select(
      "id, name, address_line, city, state, postal_code, country, lat, lng, radius_meters, timezone, is_active, created_at"
    )
    .single();

  if (error || !data) {
    return { site: insertedLocal, synced: false };
  }

  const remoteSite = mapDbSiteToLocal(data as DbCompanySite);
  if (!remoteSite) {
    return { site: insertedLocal, synced: false };
  }

  const replaced = readCachedCompanySites().map((site) =>
    site.id === insertedLocal.id ? remoteSite : site
  );
  writeCachedCompanySites(replaced);
  return { site: remoteSite, synced: true };
}

export async function updateCompanySite(
  userId: string | null | undefined,
  siteId: string,
  patch: Partial<SaveCompanySiteInput> & { isActive?: boolean },
  companyIdOverride?: string | null
): Promise<CompanySiteMutationResult | null> {
  const current = readCachedCompanySites();
  const existing = current.find((site) => site.id === siteId);
  if (!existing) return null;

  const nextLocal = normalizeSite({
    ...existing,
    ...patch
  });
  if (!nextLocal) return null;

  writeCachedCompanySites(current.map((site) => (site.id === siteId ? nextLocal : site)));

  const client = supabase;
  if (!client) return { site: nextLocal, synced: false };

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return { site: nextLocal, synced: false };

  const payload = mapLocalSiteToDb(nextLocal, companyId);

  const persistWithInsert = async () => {
    const { data: inserted, error: insertError } = await client
      .from("company_sites")
      .insert(payload)
      .select(
        "id, name, address_line, city, state, postal_code, country, lat, lng, radius_meters, timezone, is_active, created_at"
      )
      .single();
    if (insertError || !inserted) {
      return { site: nextLocal, synced: false };
    }
    const remoteInserted = mapDbSiteToLocal(inserted as DbCompanySite);
    if (!remoteInserted) {
      return { site: nextLocal, synced: false };
    }
    const replaced = readCachedCompanySites().map((site) =>
      site.id === nextLocal.id ? remoteInserted : site
    );
    writeCachedCompanySites(replaced);
    return { site: remoteInserted, synced: true };
  };

  if (!isUuid(nextLocal.id)) {
    return persistWithInsert();
  }

  const { data, error } = await client
    .from("company_sites")
    .update(payload)
    .eq("id", nextLocal.id)
    .eq("company_id", companyId)
    .select(
      "id, name, address_line, city, state, postal_code, country, lat, lng, radius_meters, timezone, is_active, created_at"
    )
    .maybeSingle();

  if (error || !data) {
    return { site: nextLocal, synced: false };
  }

  const remoteSite = mapDbSiteToLocal(data as DbCompanySite);
  if (!remoteSite) {
    return { site: nextLocal, synced: false };
  }

  writeCachedCompanySites(
    readCachedCompanySites().map((site) => (site.id === nextLocal.id ? remoteSite : site))
  );
  return { site: remoteSite, synced: true };
}

export async function setCompanySiteActive(
  userId: string | null | undefined,
  siteId: string,
  isActive: boolean,
  companyIdOverride?: string | null
): Promise<CompanySiteMutationResult | null> {
  return updateCompanySite(userId, siteId, { isActive }, companyIdOverride);
}

export function getCompanySiteById(siteId: string): CompanySite | null {
  return readCachedCompanySites().find((site) => site.id === siteId) ?? null;
}

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  country_code?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

type NominatimReverseResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

export async function geocodeAddress(query: string): Promise<GeocodeAddressResult | null> {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 5) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(
      normalizedQuery
    )}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0] as NominatimResult;
    const coords = normalizeCoordinates(first.lat, first.lon);
    if (!coords) return null;
    const city = normalizeText(
      first.address?.city ?? first.address?.town ?? first.address?.village
    );
    const addressLine = normalizeText(
      first.address?.road ?? first.address?.pedestrian ?? first.address?.neighbourhood,
      normalizedQuery
    );
    return {
      lat: coords.lat,
      lng: coords.lng,
      addressLine,
      city,
      state: normalizeText(first.address?.state),
      postalCode: normalizeText(first.address?.postcode),
      country: normalizeCountry(first.address?.country_code),
      displayName: normalizeText(first.display_name, normalizedQuery)
    };
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeocodeAddressResult | null> {
  const coords = normalizeCoordinates(lat, lng);
  if (!coords) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=18&lat=${coords.lat}&lon=${coords.lng}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimReverseResult;
    const addressLine = normalizeText(
      data.address?.road ?? data.address?.pedestrian ?? data.address?.neighbourhood,
      data.display_name ?? ""
    );
    const city = normalizeText(
      data.address?.city ?? data.address?.town ?? data.address?.village
    );
    return {
      lat: coords.lat,
      lng: coords.lng,
      addressLine,
      city,
      state: normalizeText(data.address?.state),
      postalCode: normalizeText(data.address?.postcode),
      country: normalizeCountry(data.address?.country_code),
      displayName: normalizeText(data.display_name, addressLine || `${coords.lat}, ${coords.lng}`)
    };
  } catch {
    return null;
  }
}
