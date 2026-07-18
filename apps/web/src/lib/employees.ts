import { mockEmployees, type MockEmployee } from "../data/mockEmployees";
import { isUuid } from "./profileRepo";
import { createSignedUrl, isRemoteUrl } from "./storageClient";
import { supabase } from "./supabase";

const CUSTOM_EMPLOYEES_KEY = "portal.custom_employees";
const REMOTE_EMPLOYEES_KEY = "portal.remote_employees";

type CreateEmployeeInput = {
  name: string;
  role: string;
  department: string;
  email: string;
  avatar?: string;
};

type UpdateEmployeeInput = Partial<
  Pick<MockEmployee, "name" | "role" | "department" | "email" | "phone" | "avatar" | "active">
>;

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string | null;
  role: string | null;
  department_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

function readCustomEmployees(): MockEmployee[] {
  try {
    const raw = localStorage.getItem(CUSTOM_EMPLOYEES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MockEmployee => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as MockEmployee).id === "string" &&
        typeof (item as MockEmployee).name === "string" &&
        typeof (item as MockEmployee).role === "string" &&
        typeof (item as MockEmployee).department === "string" &&
        typeof (item as MockEmployee).email === "string" &&
        typeof (item as MockEmployee).phone === "string" &&
        typeof (item as MockEmployee).avatar === "string" &&
        typeof (item as MockEmployee).active === "boolean"
      );
    });
  } catch {
    return [];
  }
}

function writeCustomEmployees(employees: MockEmployee[]) {
  localStorage.setItem(CUSTOM_EMPLOYEES_KEY, JSON.stringify(employees));
}

function readRemoteEmployees(): MockEmployee[] {
  try {
    const raw = localStorage.getItem(REMOTE_EMPLOYEES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MockEmployee => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as MockEmployee).id === "string" &&
        typeof (item as MockEmployee).name === "string" &&
        typeof (item as MockEmployee).role === "string" &&
        typeof (item as MockEmployee).department === "string" &&
        typeof (item as MockEmployee).email === "string" &&
        typeof (item as MockEmployee).phone === "string" &&
        typeof (item as MockEmployee).avatar === "string" &&
        typeof (item as MockEmployee).active === "boolean"
      );
    });
  } catch {
    return [];
  }
}

function writeRemoteEmployees(employees: MockEmployee[]) {
  localStorage.setItem(REMOTE_EMPLOYEES_KEY, JSON.stringify(employees));
}

function roleLabelFromProfile(role: string | null): string {
  switch (role) {
    case "OWNER":
      return "Proprietario";
    case "SUPER_ADMIN":
      return "Super Admin";
    case "MANAGER":
      return "Gestor";
    case "LEADER":
      return "Lider";
    case "EMPLOYEE":
      return "Colaborador";
    default:
      return "Colaborador";
  }
}

function mapProfileToEmployee(profile: ProfileRow, departmentMap: Map<string, string>): MockEmployee {
  const email = (profile.email ?? "").trim().toLowerCase();
  const safeEmail = email || `${profile.id}@empresa.local`;
  const displayName = profile.name?.trim() || safeEmail.split("@")[0] || "Colaborador";
  const departmentName = profile.department_id
    ? departmentMap.get(profile.department_id) ?? "Sem departamento"
    : "Sem departamento";

  return {
    id: profile.id,
    name: displayName,
    role: roleLabelFromProfile(profile.role),
    department: departmentName,
    active: (profile.status ?? "ACTIVE").toUpperCase() !== "INACTIVE",
    avatar:
      profile.avatar_url ??
      `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=137fec&color=fff`,
    email: safeEmail,
    phone: "+55 (11) 90000-0000"
  };
}

export function listEmployees(): MockEmployee[] {
  const merged = new Map<string, MockEmployee>();
  mockEmployees.forEach((employee) => merged.set(employee.id, employee));
  readRemoteEmployees().forEach((employee) => merged.set(employee.id, employee));
  readCustomEmployees().forEach((employee) => merged.set(employee.id, employee));
  return Array.from(merged.values());
}

export async function loadEmployees(): Promise<MockEmployee[]> {
  const fallback = listEmployees();
  if (!supabase) return fallback;

  const [{ data: departmentsData }, { data: profilesData, error: profilesError }] = await Promise.all([
    supabase.from("departments").select("id, name"),
    supabase.from("profiles").select("id, name, email, avatar_url, status, role, department_id")
  ]);

  if (profilesError || !profilesData) {
    return fallback;
  }

  const departmentMap = new Map<string, string>();
  (departmentsData as DepartmentRow[] | null)?.forEach((dept) => {
    departmentMap.set(dept.id, dept.name);
  });

  const mapped = (profilesData as ProfileRow[]).map((profile) =>
    mapProfileToEmployee(profile, departmentMap)
  );

  const withSignedAvatars = await Promise.all(
    mapped.map(async (employee) => {
      if (isRemoteUrl(employee.avatar)) return employee;
      const signed = await createSignedUrl("employee-photos", employee.avatar);
      if (!signed) return employee;
      return { ...employee, avatar: signed };
    })
  );

  writeRemoteEmployees(withSignedAvatars);
  return listEmployees();
}

export function getEmployeeById(id: string): MockEmployee | undefined {
  return listEmployees().find((employee) => employee.id === id);
}

export function employeeEmailExists(email: string, excludeId?: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const foundInMerged = listEmployees().some(
    (employee) =>
      employee.email.trim().toLowerCase() === normalizedEmail &&
      (excludeId ? employee.id !== excludeId : true)
  );
  if (foundInMerged) return true;

  // Keep baseline mock collisions detectable even if a local override changed the same ID.
  return mockEmployees.some(
    (employee) =>
      employee.email.trim().toLowerCase() === normalizedEmail &&
      (excludeId ? employee.id !== excludeId : true)
  );
}

export function createEmployee(input: CreateEmployeeInput): MockEmployee {
  const normalizedName = input.name.trim().replace(/\s+/g, " ");
  const normalizedRole = input.role.trim().replace(/\s+/g, " ");
  const normalizedDepartment = input.department.trim().replace(/\s+/g, " ");
  const normalizedEmail = input.email.trim().toLowerCase();
  const id = `e${Date.now().toString(36)}`;
  const phoneSuffix = `${Date.now() % 10000}`.padStart(4, "0");

  const employee: MockEmployee = {
    id,
    name: normalizedName,
    role: normalizedRole,
    department: normalizedDepartment,
    active: true,
    avatar:
      typeof input.avatar === "string" && input.avatar.trim()
        ? input.avatar.trim()
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(
            normalizedName
          )}&background=137fec&color=fff`,
    email: normalizedEmail,
    phone: `+55 (11) 9${phoneSuffix}-${phoneSuffix}`
  };

  const custom = readCustomEmployees();
  custom.push(employee);
  writeCustomEmployees(custom);

  return employee;
}

export function updateEmployee(id: string, input: UpdateEmployeeInput): MockEmployee | null {
  const existing = getEmployeeById(id);
  if (!existing) return null;

  const normalized: MockEmployee = {
    ...existing,
    name:
      typeof input.name === "string"
        ? input.name.trim().replace(/\s+/g, " ") || existing.name
        : existing.name,
    role:
      typeof input.role === "string"
        ? input.role.trim().replace(/\s+/g, " ") || existing.role
        : existing.role,
    department:
      typeof input.department === "string"
        ? input.department.trim().replace(/\s+/g, " ") || existing.department
        : existing.department,
    email:
      typeof input.email === "string"
        ? input.email.trim().toLowerCase() || existing.email
        : existing.email,
    phone:
      typeof input.phone === "string"
        ? input.phone.trim() || existing.phone
        : existing.phone,
    avatar:
      typeof input.avatar === "string"
        ? input.avatar.trim() || existing.avatar
        : existing.avatar,
    active: typeof input.active === "boolean" ? input.active : existing.active
  };

  const custom = readCustomEmployees();
  const existingIndex = custom.findIndex((employee) => employee.id === id);
  if (existingIndex >= 0) {
    custom[existingIndex] = normalized;
  } else {
    custom.push(normalized);
  }

  writeCustomEmployees(custom);

  if (supabase && isUuid(id)) {
    const remotePatch: Record<string, unknown> = {};
    if (typeof input.name === "string") remotePatch.name = normalized.name;
    if (typeof input.email === "string") remotePatch.email = normalized.email;
    if (typeof input.avatar === "string") remotePatch.avatar_url = normalized.avatar;
    if (typeof input.active === "boolean") remotePatch.status = normalized.active ? "ACTIVE" : "INACTIVE";

    if (Object.keys(remotePatch).length > 0) {
      void (async () => {
        try {
          await supabase.from("profiles").update(remotePatch).eq("id", id);
          await loadEmployees();
        } catch {
          // keep local fallback when remote update fails
        }
      })();
    }
  }

  return normalized;
}
