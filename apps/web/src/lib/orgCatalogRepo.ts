import { listEmployees } from "./employees";
import { resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const DEPARTMENTS_KEY = "portal.company.departments";
const JOB_TITLES_KEY = "portal.company.job_titles";

const DEFAULT_DEPARTMENTS = ["Operacoes", "Vendas", "Suporte", "Financeiro", "RH"];
const DEFAULT_JOB_TITLES = [
  "Analista Jr",
  "Analista Pleno",
  "Analista Senior",
  "Supervisor",
  "Lider"
];

type DepartmentRow = {
  name: string | null;
};

export type OrganizationCatalog = {
  departments: string[];
  jobTitles: string[];
};

export type CatalogCreateResult = {
  name: string;
  synced: boolean;
};

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeLabel)
      .filter((item) => item.length >= 2);
  } catch {
    return [];
  }
}

function mergeUnique(values: string[]): string[] {
  const map = new Map<string, string>();
  values.forEach((item) => {
    const normalized = normalizeLabel(item);
    if (normalized.length < 2) return;
    const key = normalized.toLowerCase();
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  });
  return Array.from(map.values());
}

function readList(key: string): string[] {
  try {
    return parseStringArray(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]): string[] {
  const unique = mergeUnique(values);
  localStorage.setItem(key, JSON.stringify(unique));
  return unique;
}

async function fetchRemoteDepartments(userId?: string): Promise<string[] | null> {
  if (!supabase) return null;

  const companyId = await resolveCompanyId(userId);
  if (!companyId) return null;

  const { data, error } = await supabase
    .from("departments")
    .select("name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error || !data) return null;
  return mergeUnique(
    (data as DepartmentRow[])
      .map((item) => item.name ?? "")
      .filter((item) => item.length > 0)
  );
}

export function readDepartmentCatalog(): string[] {
  const local = readList(DEPARTMENTS_KEY);
  const fromEmployees = listEmployees().map((employee) => employee.department);
  return mergeUnique([...DEFAULT_DEPARTMENTS, ...local, ...fromEmployees]);
}

export function readJobTitleCatalog(): string[] {
  const local = readList(JOB_TITLES_KEY);
  const fromEmployees = listEmployees().map((employee) => employee.role);
  return mergeUnique([...DEFAULT_JOB_TITLES, ...local, ...fromEmployees]);
}

export async function loadOrganizationCatalog(userId?: string): Promise<OrganizationCatalog> {
  const localDepartments = readList(DEPARTMENTS_KEY);
  const localJobTitles = readList(JOB_TITLES_KEY);
  const fromEmployees = listEmployees();
  const employeeDepartments = fromEmployees.map((employee) => employee.department);
  const employeeRoles = fromEmployees.map((employee) => employee.role);

  const remoteDepartments = await fetchRemoteDepartments(userId);
  const departments = writeList(
    DEPARTMENTS_KEY,
    mergeUnique([
      ...DEFAULT_DEPARTMENTS,
      ...employeeDepartments,
      ...(remoteDepartments ?? []),
      ...localDepartments
    ])
  );

  const jobTitles = writeList(
    JOB_TITLES_KEY,
    mergeUnique([...DEFAULT_JOB_TITLES, ...employeeRoles, ...localJobTitles])
  );

  return { departments, jobTitles };
}

export async function addDepartmentCatalogItem(
  name: string,
  userId?: string
): Promise<CatalogCreateResult> {
  const normalized = normalizeLabel(name);
  if (normalized.length < 2) {
    throw new Error("Informe um nome valido para o departamento.");
  }

  const local = readDepartmentCatalog();
  const alreadyExists = local.some(
    (item) => item.toLowerCase() === normalized.toLowerCase()
  );
  if (!alreadyExists) {
    writeList(DEPARTMENTS_KEY, [...local, normalized]);
  }

  if (!supabase) {
    return { name: normalized, synced: false };
  }

  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    return { name: normalized, synced: false };
  }

  const remote = await fetchRemoteDepartments(userId);
  const existsRemote = Boolean(
    remote?.some((item) => item.toLowerCase() === normalized.toLowerCase())
  );
  if (existsRemote) {
    return { name: normalized, synced: true };
  }

  const { error } = await supabase.from("departments").insert({
    company_id: companyId,
    name: normalized
  });

  if (error) {
    return { name: normalized, synced: false };
  }

  return { name: normalized, synced: true };
}

export function addJobTitleCatalogItem(name: string): CatalogCreateResult {
  const normalized = normalizeLabel(name);
  if (normalized.length < 2) {
    throw new Error("Informe um nome valido para o cargo.");
  }

  const local = readJobTitleCatalog();
  const exists = local.some((item) => item.toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    writeList(JOB_TITLES_KEY, [...local, normalized]);
  }

  return { name: normalized, synced: false };
}
