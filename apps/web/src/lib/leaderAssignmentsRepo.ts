import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const LEADER_ASSIGNMENTS_KEY = "portal.leader_assignments";

export type LeaderAssignment = {
  employeeId: string;
  leaderId: string;
  updatedAt: string;
};

type DbLeaderRow = {
  id: string;
  leader_id: string | null;
};

function normalizeId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseAssignments(raw: string | null): LeaderAssignment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as Partial<LeaderAssignment>;
        const employeeId = normalizeId(candidate.employeeId);
        const leaderId = normalizeId(candidate.leaderId);
        if (!employeeId || !leaderId) return null;
        return {
          employeeId,
          leaderId,
          updatedAt: normalizeId(candidate.updatedAt) || new Date().toISOString()
        };
      })
      .filter((item): item is LeaderAssignment => item !== null);
  } catch {
    return [];
  }
}

function writeAssignments(assignments: LeaderAssignment[]): LeaderAssignment[] {
  const next = [...assignments].sort((a, b) => {
    if (a.employeeId !== b.employeeId) return a.employeeId.localeCompare(b.employeeId);
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  localStorage.setItem(LEADER_ASSIGNMENTS_KEY, JSON.stringify(next));
  return next;
}

function readAllAssignments(): LeaderAssignment[] {
  const demoDefaults: LeaderAssignment[] = [
    { employeeId: "e01", leaderId: "demo", updatedAt: new Date().toISOString() },
    { employeeId: "e03", leaderId: "demo", updatedAt: new Date().toISOString() },
    { employeeId: "e04", leaderId: "demo", updatedAt: new Date().toISOString() }
  ];

  const withDemoDefaults = (assignments: LeaderAssignment[]): LeaderAssignment[] => {
    if (assignments.length === 0) return demoDefaults;
    const byEmployeeId = new Map<string, LeaderAssignment>();
    assignments.forEach((assignment) => {
      byEmployeeId.set(assignment.employeeId, assignment);
    });
    demoDefaults.forEach((assignment) => {
      if (!byEmployeeId.has(assignment.employeeId)) {
        byEmployeeId.set(assignment.employeeId, assignment);
      }
    });
    return Array.from(byEmployeeId.values());
  };

  try {
    const parsed = parseAssignments(localStorage.getItem(LEADER_ASSIGNMENTS_KEY));
    return withDemoDefaults(parsed);
  } catch {
    return demoDefaults;
  }
}

export function readAllLeaderAssignments(): LeaderAssignment[] {
  return readAllAssignments();
}

export function readLeaderAssignment(employeeId: string): string | null {
  const normalized = normalizeId(employeeId);
  if (!normalized) return null;
  const existing = readAllAssignments().find((item) => item.employeeId === normalized);
  return existing?.leaderId ?? null;
}

export function readAssignedEmployees(leaderId: string): string[] {
  const normalized = normalizeId(leaderId);
  if (!normalized) return [];
  return readAllAssignments()
    .filter((item) => item.leaderId === normalized)
    .map((item) => item.employeeId);
}

export async function loadLeaderAssignments(
  actorUserId?: string
): Promise<LeaderAssignment[]> {
  const local = readAllAssignments();
  if (!supabase) return local;

  const companyId = await resolveCompanyId(actorUserId ?? null);
  if (!companyId) return local;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, leader_id")
    .eq("company_id", companyId);

  if (error || !data) return local;

  const rows = data as DbLeaderRow[];
  const profileIds = new Set(rows.map((row) => row.id));
  const next = local.filter((item) => !profileIds.has(item.employeeId));
  const updatedAt = new Date().toISOString();

  rows.forEach((row) => {
    const leaderId = typeof row.leader_id === "string" ? row.leader_id : "";
    if (!leaderId) return;
    next.push({
      employeeId: row.id,
      leaderId,
      updatedAt
    });
  });

  writeAssignments(next);
  return next;
}

export async function saveLeaderAssignment(
  employeeId: string,
  leaderId: string | null,
  actorUserId?: string
): Promise<{ synced: boolean; leaderId: string | null }> {
  const normalizedEmployeeId = normalizeId(employeeId);
  const normalizedLeaderId = normalizeId(leaderId ?? "");

  if (!normalizedEmployeeId) {
    return { synced: false, leaderId: null };
  }

  if (normalizedLeaderId && normalizedLeaderId === normalizedEmployeeId) {
    return { synced: false, leaderId: null };
  }

  const updatedAt = new Date().toISOString();
  const current = readAllAssignments().filter(
    (item) => item.employeeId !== normalizedEmployeeId
  );
  if (normalizedLeaderId) {
    current.push({
      employeeId: normalizedEmployeeId,
      leaderId: normalizedLeaderId,
      updatedAt
    });
  }
  writeAssignments(current);

  if (!supabase || !isUuid(normalizedEmployeeId)) {
    return { synced: false, leaderId: normalizedLeaderId || null };
  }

  const patch = {
    leader_id: isUuid(normalizedLeaderId) ? normalizedLeaderId : null
  };
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", normalizedEmployeeId);

  if (!error) {
    await loadLeaderAssignments(actorUserId ?? normalizedEmployeeId);
  }

  return { synced: !error, leaderId: normalizedLeaderId || null };
}
