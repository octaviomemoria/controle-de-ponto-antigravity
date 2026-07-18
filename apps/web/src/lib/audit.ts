import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const AUDIT_KEY = "portal.audit_logs";
const AUDIT_PENDING_KEY = "portal.audit_logs_pending";
const MAX_AUDIT_LOGS = 2000;
const MAX_PENDING_AUDIT_LOGS = 1500;

export type AuditLog = {
  id: string;
  companyId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

function buildFallbackUuid() {
  const nowHex = Date.now().toString(16).padStart(12, "0");
  const randomHex = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
    .replace(/[^0-9a-f]/gi, "")
    .padEnd(20, "0")
    .slice(0, 20);
  return `${randomHex.slice(0, 8)}-${randomHex.slice(8, 12)}-4${randomHex.slice(13, 16)}-a${randomHex.slice(17, 20)}-${nowHex.slice(0, 12)}`;
}

function createAuditId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return buildFallbackUuid();
}

function parseAuditLogs(raw: string | null): AuditLog[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AuditLog => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as AuditLog;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.action === "string" &&
        typeof candidate.entityType === "string" &&
        typeof candidate.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function readAuditLogs(): AuditLog[] {
  try {
    return parseAuditLogs(localStorage.getItem(AUDIT_KEY));
  } catch {
    return [];
  }
}

function writeAuditLogs(logs: AuditLog[]) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(logs.slice(-MAX_AUDIT_LOGS)));
}

function readPendingAuditLogs(): AuditLog[] {
  try {
    return parseAuditLogs(localStorage.getItem(AUDIT_PENDING_KEY));
  } catch {
    return [];
  }
}

function writePendingAuditLogs(logs: AuditLog[]) {
  localStorage.setItem(
    AUDIT_PENDING_KEY,
    JSON.stringify(logs.slice(-MAX_PENDING_AUDIT_LOGS))
  );
}

function enqueuePendingAudit(entry: AuditLog) {
  const current = readPendingAuditLogs();
  if (current.some((item) => item.id === entry.id)) return;
  current.push(entry);
  writePendingAuditLogs(current);
}

function removePendingAuditById(ids: string[]) {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const current = readPendingAuditLogs();
  const next = current.filter((item) => !idSet.has(item.id));
  writePendingAuditLogs(next);
}

function mapAuditToRemotePayload(entry: AuditLog, companyId: string | null) {
  return {
    id: isUuid(entry.id) ? entry.id : undefined,
    company_id: companyId,
    actor_id: entry.actorId && isUuid(entry.actorId) ? entry.actorId : null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId && isUuid(entry.entityId) ? entry.entityId : null,
    payload: entry.payload ?? null,
    created_at: entry.createdAt
  };
}

export async function syncPendingAuditLogs(actorId?: string): Promise<number> {
  if (!supabase) return 0;

  const pending = readPendingAuditLogs();
  if (pending.length === 0) return 0;

  const candidates = pending.filter((entry) => {
    if (!entry.actorId || !isUuid(entry.actorId)) return false;
    if (!actorId) return true;
    return entry.actorId === actorId;
  });
  if (candidates.length === 0) return 0;

  const syncedIds: string[] = [];

  for (const entry of candidates) {
    const resolvedCompanyId =
      entry.companyId && isUuid(entry.companyId)
        ? entry.companyId
        : await resolveCompanyId(entry.actorId);

    const payload = mapAuditToRemotePayload(entry, resolvedCompanyId);

    const { error } = await supabase
      .from("audit_logs")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      syncedIds.push(entry.id);
    }
  }

  removePendingAuditById(syncedIds);
  return syncedIds.length;
}

export function appendAuditLog(input: Omit<AuditLog, "id" | "createdAt">): AuditLog {
  const entry: AuditLog = {
    id: createAuditId(),
    createdAt: new Date().toISOString(),
    ...input
  };

  const current = readAuditLogs();
  current.push(entry);
  writeAuditLogs(current);

  if (supabase && entry.actorId && isUuid(entry.actorId)) {
    enqueuePendingAudit(entry);
    void syncPendingAuditLogs(entry.actorId);
  }

  return entry;
}
