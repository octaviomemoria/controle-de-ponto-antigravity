import { readAuditLogs, type AuditLog } from "./audit";
import { supabase } from "./supabase";

export type AuditRecord = AuditLog & {
  source: "local" | "remote";
};

type RemoteAuditRow = {
  id: string;
  company_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function mapLocalToRecord(entry: AuditLog): AuditRecord {
  return {
    ...entry,
    source: "local"
  };
}

function mapRemoteToRecord(entry: RemoteAuditRow): AuditRecord {
  return {
    id: entry.id,
    companyId: entry.company_id ?? undefined,
    actorId: entry.actor_id ?? undefined,
    action: entry.action,
    entityType: entry.entity_type,
    entityId: entry.entity_id ?? undefined,
    payload: entry.payload ?? undefined,
    createdAt: entry.created_at,
    source: "remote"
  };
}

function sortByCreatedAtDesc(logs: AuditRecord[]): AuditRecord[] {
  return [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeById(local: AuditRecord[], remote: AuditRecord[]): AuditRecord[] {
  const merged = new Map<string, AuditRecord>();
  remote.forEach((item) => merged.set(item.id, item));
  local.forEach((item) => {
    if (!merged.has(item.id)) merged.set(item.id, item);
  });
  return sortByCreatedAtDesc(Array.from(merged.values()));
}

export function readCachedAuditRecords(): AuditRecord[] {
  return sortByCreatedAtDesc(readAuditLogs().map(mapLocalToRecord));
}

export async function loadAuditRecords(limit = 400): Promise<AuditRecord[]> {
  const local = readCachedAuditRecords();
  if (!supabase) return local;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, company_id, actor_id, action, entity_type, entity_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return local;
  }

  const remote = (data as RemoteAuditRow[]).map(mapRemoteToRecord);
  return mergeById(local, remote);
}

