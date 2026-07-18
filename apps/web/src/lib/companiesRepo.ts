import { mockCompanies, type MockCompany } from "../data/mockCompanies";
import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const REMOTE_COMPANIES_KEY = "portal.remote_companies";
const CUSTOM_COMPANIES_KEY = "portal.custom_companies";

type CompanyRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  logo_url: string | null;
};

type CompanySettingsRow = {
  company_id: string;
  work_hours: number | string;
  tolerance_minutes: number;
  timezone: string | null;
  time_tracking_mode: "SIMPLE" | "FULL";
};

type CompanyProfileRow = {
  company_id: string | null;
};

type CompanyEntryRow = {
  company_id: string;
};

type PersistCompanyInput = {
  name: string;
};

type PersistCompanyResult = {
  company: MockCompany;
  synced: boolean;
};

export type UpdateCompanyInput = {
  name?: string;
  status?: "ACTIVE" | "TRIAL" | "SUSPENDED";
  logoUrl?: string;
  workHours?: number;
  toleranceMinutes?: number;
  timezone?: string;
  timeTrackingMode?: "SIMPLE" | "FULL";
};

function parseCompanyList(raw: string | null): MockCompany[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MockCompany => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as MockCompany;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.status === "string" &&
        typeof candidate.statusText === "string" &&
        typeof candidate.employeeCount === "number"
      );
    });
  } catch {
    return [];
  }
}

function readCompanyList(key: string): MockCompany[] {
  try {
    return parseCompanyList(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeCompanyList(key: string, companies: MockCompany[]) {
  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name));
  localStorage.setItem(key, JSON.stringify(sorted));
}

function statusLabel(status: CompanyRow["status"]): string {
  if (status === "ACTIVE") return "Ativa";
  if (status === "SUSPENDED") return "Suspensa";
  return "Teste Iniciado";
}

function mapStatus(status: CompanyRow["status"]): "ACTIVE" | "TRIAL" | "SUSPENDED" {
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "SUSPENDED") return "SUSPENDED";
  return "TRIAL";
}

function parseWorkHours(value: number | string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24) return 8;
  return parsed;
}

function formatPunchCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, value));
}

function mapRowsToCompanies(
  companyRows: CompanyRow[],
  settingsRows: CompanySettingsRow[],
  profileRows: CompanyProfileRow[],
  entryRows: CompanyEntryRow[]
): MockCompany[] {
  const settingsByCompany = new Map<string, CompanySettingsRow>();
  settingsRows.forEach((settings) => settingsByCompany.set(settings.company_id, settings));

  const employeesByCompany = new Map<string, number>();
  profileRows.forEach((profile) => {
    if (!profile.company_id) return;
    employeesByCompany.set(
      profile.company_id,
      (employeesByCompany.get(profile.company_id) ?? 0) + 1
    );
  });

  const entriesByCompany = new Map<string, number>();
  entryRows.forEach((entry) => {
    entriesByCompany.set(entry.company_id, (entriesByCompany.get(entry.company_id) ?? 0) + 1);
  });

  return companyRows.map((company) => {
    const settings = settingsByCompany.get(company.id);
    const employeeCount = employeesByCompany.get(company.id) ?? 0;
    const totalPunches = entriesByCompany.get(company.id) ?? 0;

    return {
      id: company.id,
      name: company.name,
      status: mapStatus(company.status),
      statusText: statusLabel(company.status),
      logoUrl: company.logo_url ?? "",
      employeeCount,
      totalPunches: formatPunchCount(totalPunches),
      settings: {
        workHours: parseWorkHours(settings?.work_hours),
        toleranceMinutes: Number(settings?.tolerance_minutes ?? 10),
        timezone: settings?.timezone ?? "America/Sao_Paulo",
        timeTrackingMode: settings?.time_tracking_mode ?? "FULL"
      }
    } satisfies MockCompany;
  });
}

function mergeCompanies(): MockCompany[] {
  const merged = new Map<string, MockCompany>();
  mockCompanies.forEach((company) => merged.set(company.id, company));
  readCompanyList(REMOTE_COMPANIES_KEY).forEach((company) => merged.set(company.id, company));
  readCompanyList(CUSTOM_COMPANIES_KEY).forEach((company) => merged.set(company.id, company));
  return Array.from(merged.values());
}

function writeCustomCompany(company: MockCompany) {
  const current = readCompanyList(CUSTOM_COMPANIES_KEY);
  const filtered = current.filter((item) => item.id !== company.id);
  filtered.push(company);
  writeCompanyList(CUSTOM_COMPANIES_KEY, filtered);
}

function updateCompanyInCache(companyId: string, updater: (company: MockCompany) => MockCompany) {
  let updated = false;
  const updateList = (key: string) => {
    const list = readCompanyList(key);
    const next = list.map((company) => {
      if (company.id !== companyId) return company;
      updated = true;
      return updater(company);
    });
    writeCompanyList(key, next);
  };

  updateList(REMOTE_COMPANIES_KEY);
  updateList(CUSTOM_COMPANIES_KEY);

  if (!updated) {
    const fallbackCompany = mergeCompanies().find((company) => company.id === companyId);
    if (fallbackCompany) {
      writeCustomCompany(updater(fallbackCompany));
    }
  }
}

export function listCachedCompanies(): MockCompany[] {
  return mergeCompanies();
}

export async function resolveCompanyNameForUser(
  userId: string | null | undefined
): Promise<string | null> {
  const cached = listCachedCompanies();
  if (!supabase) {
    return cached[0]?.name ?? null;
  }

  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    return cached[0]?.name ?? null;
  }

  const cachedMatch = cached.find((company) => company.id === companyId);
  if (cachedMatch) return cachedMatch.name;

  const remote = await loadCompanies();
  return remote.find((company) => company.id === companyId)?.name ?? null;
}

export async function resolveCompanyInfoForUser(
  userId: string | null | undefined
): Promise<{ name: string | null; logoUrl?: string | null }> {
  const cached = listCachedCompanies();
  if (!supabase) {
    const fallback = cached[0] ?? null;
    return { name: fallback?.name ?? null, logoUrl: fallback?.logoUrl ?? null };
  }

  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    const fallback = cached[0] ?? null;
    return { name: fallback?.name ?? null, logoUrl: fallback?.logoUrl ?? null };
  }

  const cachedMatch = cached.find((company) => company.id === companyId);
  if (cachedMatch) {
    return { name: cachedMatch.name, logoUrl: cachedMatch.logoUrl ?? null };
  }

  const remote = await loadCompanies();
  const match = remote.find((company) => company.id === companyId) ?? null;
  return { name: match?.name ?? null, logoUrl: match?.logoUrl ?? null };
}

export async function loadCompanies(): Promise<MockCompany[]> {
  const fallback = listCachedCompanies();
  if (!supabase) return fallback;

  const [companiesRes, settingsRes, profilesRes, entriesRes] = await Promise.all([
    supabase.from("companies").select("id, name, status, logo_url").order("name"),
    supabase
      .from("company_settings")
      .select("company_id, work_hours, tolerance_minutes, timezone, time_tracking_mode"),
    supabase.from("profiles").select("company_id"),
    supabase.from("time_entries").select("company_id")
  ]);

  if (companiesRes.error || !companiesRes.data) {
    return fallback;
  }

  const mapped = mapRowsToCompanies(
    companiesRes.data as CompanyRow[],
    (settingsRes.data as CompanySettingsRow[] | null) ?? [],
    (profilesRes.data as CompanyProfileRow[] | null) ?? [],
    (entriesRes.data as CompanyEntryRow[] | null) ?? []
  );

  writeCompanyList(REMOTE_COMPANIES_KEY, mapped);
  return mergeCompanies();
}

export async function createCompany(input: PersistCompanyInput): Promise<PersistCompanyResult> {
  const local: MockCompany = {
    id: `c${Date.now()}`,
    name: input.name.trim(),
    status: "TRIAL",
    statusText: "Teste Iniciado",
    logoUrl: "",
    employeeCount: 0,
    totalPunches: "0",
    settings: {
      workHours: 8,
      toleranceMinutes: 10,
      timezone: "America/Sao_Paulo",
      timeTrackingMode: "FULL"
    }
  };
  writeCustomCompany(local);

  if (!supabase) return { company: local, synced: false };

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: local.name,
      status: "TRIAL",
      logo_url: null
    })
    .select("id, name, status, logo_url")
    .single();

  if (error || !data) {
    return { company: local, synced: false };
  }

  const remoteRow = data as CompanyRow;
  const remoteCompany: MockCompany = {
    ...local,
    id: remoteRow.id,
    name: remoteRow.name,
    status: mapStatus(remoteRow.status),
    statusText: statusLabel(remoteRow.status),
    logoUrl: remoteRow.logo_url ?? ""
  };

  writeCompanyList(
    CUSTOM_COMPANIES_KEY,
    readCompanyList(CUSTOM_COMPANIES_KEY).filter((company) => company.id !== local.id)
  );
  writeCustomCompany(remoteCompany);

  if (isUuid(remoteCompany.id)) {
    await supabase.from("company_settings").upsert(
      {
        company_id: remoteCompany.id,
        time_tracking_mode: remoteCompany.settings.timeTrackingMode,
        work_hours: remoteCompany.settings.workHours,
        tolerance_minutes: remoteCompany.settings.toleranceMinutes,
        timezone: remoteCompany.settings.timezone,
        updated_at: new Date().toISOString()
      },
      { onConflict: "company_id" }
    );
  }

  return { company: remoteCompany, synced: true };
}

export async function updateCompanyTrackingMode(
  companyId: string,
  mode: "SIMPLE" | "FULL"
): Promise<{ synced: boolean }> {
  updateCompanyInCache(companyId, (company) => ({
    ...company,
    settings: { ...company.settings, timeTrackingMode: mode }
  }));

  if (!supabase || !isUuid(companyId)) return { synced: false };

  const { error } = await supabase.from("company_settings").upsert(
    {
      company_id: companyId,
      time_tracking_mode: mode,
      updated_at: new Date().toISOString()
    },
    { onConflict: "company_id" }
  );

  return { synced: !error };
}

export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput
): Promise<{ company: MockCompany | null; synced: boolean }> {
  const current = mergeCompanies().find((company) => company.id === companyId);
  if (!current) {
    return { company: null, synced: false };
  }

  const normalized: MockCompany = {
    ...current,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim().replace(/\s+/g, " ")
        : current.name,
    status: input.status ?? current.status,
    statusText: statusLabel((input.status ?? current.status) as CompanyRow["status"]),
    logoUrl:
      typeof input.logoUrl === "string" ? input.logoUrl.trim() : current.logoUrl ?? "",
    settings: {
      ...current.settings,
      workHours:
        typeof input.workHours === "number" && Number.isFinite(input.workHours)
          ? Math.min(24, Math.max(1, input.workHours))
          : current.settings.workHours,
      toleranceMinutes:
        typeof input.toleranceMinutes === "number" && Number.isFinite(input.toleranceMinutes)
          ? Math.min(180, Math.max(0, Math.round(input.toleranceMinutes)))
          : current.settings.toleranceMinutes,
      timezone:
        typeof input.timezone === "string" && input.timezone.trim()
          ? input.timezone.trim()
          : current.settings.timezone,
      timeTrackingMode: input.timeTrackingMode ?? current.settings.timeTrackingMode
    }
  };

  writeCustomCompany(normalized);

  if (!supabase || !isUuid(companyId)) {
    return { company: normalized, synced: false };
  }

  const companyPatch: Record<string, unknown> = {};
  if (typeof input.name === "string") companyPatch.name = normalized.name;
  if (typeof input.status === "string") companyPatch.status = normalized.status;
  if (typeof input.logoUrl === "string") companyPatch.logo_url = normalized.logoUrl || null;

  const settingsPatch: Record<string, unknown> = {
    company_id: companyId,
    updated_at: new Date().toISOString()
  };
  if (typeof input.workHours === "number") settingsPatch.work_hours = normalized.settings.workHours;
  if (typeof input.toleranceMinutes === "number") {
    settingsPatch.tolerance_minutes = normalized.settings.toleranceMinutes;
  }
  if (typeof input.timezone === "string") settingsPatch.timezone = normalized.settings.timezone;
  if (typeof input.timeTrackingMode === "string") {
    settingsPatch.time_tracking_mode = normalized.settings.timeTrackingMode;
  }

  let companyError = null as unknown;
  let settingsError = null as unknown;

  if (Object.keys(companyPatch).length > 0) {
    const { error } = await supabase.from("companies").update(companyPatch).eq("id", companyId);
    companyError = error;
  }

  if (Object.keys(settingsPatch).length > 2) {
    const { error } = await supabase
      .from("company_settings")
      .upsert(settingsPatch, { onConflict: "company_id" });
    settingsError = error;
  }

  const synced = !companyError && !settingsError;
  return { company: normalized, synced };
}
