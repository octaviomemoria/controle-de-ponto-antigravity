import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const INVITATIONS_KEY = "portal.invitations";

export type InvitationRole = "EMPLOYEE" | "LEADER" | "MANAGER";

export type InvitationRecord = {
  id: string;
  email: string;
  role: InvitationRole;
  status: "PENDING" | "ACCEPTED";
  createdAt: string;
  companyId?: string;
};

type DbInvitation = {
  id: string;
  company_id: string;
  email: string;
  role: InvitationRole | "OWNER" | "SUPER_ADMIN";
  status: string;
  created_at: string;
};

function parseInvitations(raw: string | null): InvitationRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is InvitationRecord => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as InvitationRecord;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.email === "string" &&
        typeof candidate.role === "string" &&
        typeof candidate.status === "string"
      );
    });
  } catch {
    return [];
  }
}

function readAllCachedInvitations(): InvitationRecord[] {
  try {
    return parseInvitations(localStorage.getItem(INVITATIONS_KEY));
  } catch {
    return [];
  }
}

function writeAllCachedInvitations(invitations: InvitationRecord[]): InvitationRecord[] {
  const sorted = [...invitations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  localStorage.setItem(INVITATIONS_KEY, JSON.stringify(sorted));
  return sorted;
}

function mapDbToLocal(db: DbInvitation): InvitationRecord {
  return {
    id: db.id,
    email: db.email,
    role: db.role === "OWNER" || db.role === "SUPER_ADMIN" ? "MANAGER" : db.role,
    status: db.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
    createdAt: db.created_at,
    companyId: db.company_id
  };
}

export function readCachedInvitations(): InvitationRecord[] {
  return readAllCachedInvitations();
}

export async function appendInvitation(input: {
  actorUserId?: string;
  email: string;
  role: InvitationRole;
}): Promise<{ invitation: InvitationRecord; synced: boolean }> {
  const local: InvitationRecord = {
    id: `inv-${Date.now()}`,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  const current = readAllCachedInvitations();
  writeAllCachedInvitations([local, ...current]);

  if (!supabase || !isUuid(input.actorUserId)) {
    return { invitation: local, synced: false };
  }

  const companyId = await resolveCompanyId(input.actorUserId);
  if (!companyId) {
    return { invitation: local, synced: false };
  }

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      company_id: companyId,
      email: local.email,
      role: input.role,
      status: "PENDING"
    })
    .select("id, company_id, email, role, status, created_at")
    .single();

  if (error || !data) {
    return { invitation: local, synced: false };
  }

  const remote = mapDbToLocal(data as DbInvitation);
  const next = readAllCachedInvitations().filter((item) => item.id !== local.id);
  next.push(remote);
  writeAllCachedInvitations(next);
  return { invitation: remote, synced: true };
}

export async function syncPendingInvitations(actorUserId?: string): Promise<number> {
  if (!supabase || !isUuid(actorUserId)) return 0;

  const companyId = await resolveCompanyId(actorUserId);
  if (!companyId) return 0;

  const cached = readAllCachedInvitations();
  const pending = cached.filter((item) => !isUuid(item.id));
  if (pending.length === 0) return 0;

  let syncedCount = 0;
  const next = [...cached];

  for (const invitation of pending) {
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        company_id: companyId,
        email: invitation.email,
        role: invitation.role,
        status: "PENDING"
      })
      .select("id, company_id, email, role, status, created_at")
      .single();

    if (error || !data) continue;

    const remote = mapDbToLocal(data as DbInvitation);
    const index = next.findIndex((item) => item.id === invitation.id);
    if (index >= 0) {
      next[index] = remote;
      syncedCount += 1;
    }
  }

  if (syncedCount > 0) {
    writeAllCachedInvitations(next);
  }

  return syncedCount;
}
