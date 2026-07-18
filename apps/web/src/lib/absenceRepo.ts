import { computeSlaDueAt } from "./approvalSla";
import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";
import { remapTimeEntryId } from "./timeEntriesRepo";

const ABSENCE_KEY = "portal.absence_justifications";
const ABSENCE_APPROVAL_META_KEY = "portal.absence_approval_meta";

const ABSENCE_SELECT_FULL =
  "id, user_id, date, reason, description, created_by, status, reviewed_by, reviewed_at, review_note, sla_due_at, created_at";
const ABSENCE_SELECT_BASE =
  "id, user_id, date, reason, description, created_by, created_at";

export type AbsenceApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type UpdateAbsenceStatusInput = {
  actorId?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export type AbsenceJustification = {
  id: string;
  employeeId: string;
  date: string;
  reason: string;
  description: string;
  createdBy?: string;
  status: AbsenceApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  slaDueAt?: string;
  createdAt: string;
};

type DbAbsenceJustification = {
  id: string;
  user_id: string;
  date: string;
  reason: string;
  description: string | null;
  created_by: string | null;
  status?: AbsenceApprovalStatus | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  sla_due_at?: string | null;
  created_at: string;
};

type AbsenceApprovalMeta = {
  status: AbsenceApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  slaDueAt?: string;
};

function buildSeedAbsences(): AbsenceJustification[] {
  const dateOnly = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().slice(0, 10);
  };
  const dateTime = (daysAgo: number, hour: number, minute: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  return [
    normalizeAbsence({
      id: "abs-seed-demo-pending",
      employeeId: "demo",
      date: dateOnly(1),
      reason: "Consulta Medica",
      description: "Aguardando analise do RH.",
      status: "PENDING",
      createdAt: dateTime(1, 9, 12)
    }),
    normalizeAbsence({
      id: "abs-seed-demo-approved",
      employeeId: "demo",
      date: dateOnly(8),
      reason: "Acompanhamento Familiar",
      description: "Abono validado pela lideranca.",
      status: "APPROVED",
      reviewedBy: "manager-demo",
      reviewedAt: dateTime(7, 11, 5),
      reviewNote: "Aprovado com comprovante.",
      createdAt: dateTime(8, 8, 40)
    })
  ];
}

function ensureDemoSeedAbsences(absences: AbsenceJustification[]): AbsenceJustification[] {
  const hasDemoAbsences = absences.some((absence) => absence.employeeId === "demo");
  if (hasDemoAbsences) return absences;

  const merged = new Map<string, AbsenceJustification>();
  absences.forEach((absence) => merged.set(absence.id, normalizeAbsence(absence)));
  buildSeedAbsences().forEach((absence) => merged.set(absence.id, absence));
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseCachedAbsences(raw: string | null): AbsenceJustification[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AbsenceJustification => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as AbsenceJustification;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.employeeId === "string" &&
        typeof candidate.date === "string"
      );
    });
  } catch {
    return [];
  }
}

function parseApprovalMeta(raw: string | null): Record<string, AbsenceApprovalMeta> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const next: Record<string, AbsenceApprovalMeta> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof id !== "string") continue;
      if (typeof value !== "object" || value === null) continue;
      const candidate = value as AbsenceApprovalMeta;
      if (
        candidate.status !== "PENDING" &&
        candidate.status !== "APPROVED" &&
        candidate.status !== "REJECTED"
      ) {
        continue;
      }
      next[id] = {
        status: candidate.status,
        reviewedBy:
          typeof candidate.reviewedBy === "string" ? candidate.reviewedBy : undefined,
        reviewedAt:
          typeof candidate.reviewedAt === "string" ? candidate.reviewedAt : undefined,
        reviewNote:
          typeof candidate.reviewNote === "string" ? candidate.reviewNote : undefined,
        slaDueAt:
          typeof candidate.slaDueAt === "string" ? candidate.slaDueAt : undefined
      };
    }
    return next;
  } catch {
    return {};
  }
}

function readApprovalMeta(): Record<string, AbsenceApprovalMeta> {
  try {
    return parseApprovalMeta(localStorage.getItem(ABSENCE_APPROVAL_META_KEY));
  } catch {
    return {};
  }
}

function writeApprovalMeta(meta: Record<string, AbsenceApprovalMeta>) {
  localStorage.setItem(ABSENCE_APPROVAL_META_KEY, JSON.stringify(meta));
}

function normalizeAbsence(absence: AbsenceJustification): AbsenceJustification {
  const createdAt = absence.createdAt || new Date().toISOString();
  const status = absence.status ?? "PENDING";

  const normalized: AbsenceJustification = {
    ...absence,
    createdAt,
    status,
    slaDueAt: absence.slaDueAt ?? computeSlaDueAt(createdAt)
  };

  if (status === "PENDING") {
    delete normalized.reviewedBy;
    delete normalized.reviewedAt;
    delete normalized.reviewNote;
  }

  return normalized;
}

function readAllCachedAbsences(): AbsenceJustification[] {
  const parsed = (() => {
    try {
      return parseCachedAbsences(localStorage.getItem(ABSENCE_KEY));
    } catch {
      return [];
    }
  })();

  const metaById = readApprovalMeta();
  const merged = parsed.map((absence) =>
    normalizeAbsence({
      ...absence,
      ...metaById[absence.id]
    })
  );
  const seeded = ensureDemoSeedAbsences(merged);
  if (!merged.some((absence) => absence.employeeId === "demo")) {
    writeAllCachedAbsences(seeded);
  }
  return seeded;
}

function writeAllCachedAbsences(absences: AbsenceJustification[]): AbsenceJustification[] {
  const normalized = absences.map(normalizeAbsence);
  const sorted = [...normalized].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  localStorage.setItem(ABSENCE_KEY, JSON.stringify(sorted));

  const existingMeta = readApprovalMeta();
  sorted.forEach((absence) => {
    existingMeta[absence.id] = {
      status: absence.status,
      reviewedBy: absence.reviewedBy,
      reviewedAt: absence.reviewedAt,
      reviewNote: absence.reviewNote,
      slaDueAt: absence.slaDueAt
    };
  });
  writeApprovalMeta(existingMeta);
  return sorted;
}

function mapDbToLocal(db: DbAbsenceJustification): AbsenceJustification {
  return normalizeAbsence({
    id: db.id,
    employeeId: db.user_id,
    date: db.date,
    reason: db.reason,
    description: db.description ?? "",
    createdBy: db.created_by ?? undefined,
    status: db.status ?? "PENDING",
    reviewedBy: db.reviewed_by ?? undefined,
    reviewedAt: db.reviewed_at ?? undefined,
    reviewNote: db.review_note ?? undefined,
    slaDueAt: db.sla_due_at ?? undefined,
    createdAt: db.created_at
  });
}

function mapLocalToDbBase(absence: AbsenceJustification, companyId: string) {
  return {
    company_id: companyId,
    user_id: absence.employeeId,
    date: absence.date,
    reason: absence.reason,
    description: absence.description || null,
    created_by: absence.createdBy && isUuid(absence.createdBy) ? absence.createdBy : null
  };
}

function mapLocalToDbFull(absence: AbsenceJustification, companyId: string) {
  return {
    ...mapLocalToDbBase(absence, companyId),
    status: absence.status,
    reviewed_by:
      absence.reviewedBy && isUuid(absence.reviewedBy) ? absence.reviewedBy : null,
    reviewed_at: absence.reviewedAt ?? null,
    review_note: absence.reviewNote ?? null,
    sla_due_at: absence.slaDueAt ?? null
  };
}

function mergeAbsences(
  localAbsences: AbsenceJustification[],
  remoteAbsences: AbsenceJustification[]
): AbsenceJustification[] {
  const localById = new Map<string, AbsenceJustification>();
  localAbsences.forEach((absence) => localById.set(absence.id, absence));

  const merged = new Map<string, AbsenceJustification>();
  localAbsences.forEach((absence) => merged.set(absence.id, normalizeAbsence(absence)));

  remoteAbsences.forEach((absence) => {
    const localMatch = localById.get(absence.id);
    const remoteHasReviewData =
      absence.status !== "PENDING" ||
      Boolean(absence.reviewedAt || absence.reviewedBy || absence.reviewNote);

    merged.set(
      absence.id,
      normalizeAbsence({
        ...absence,
        status:
          remoteHasReviewData || !localMatch
            ? absence.status
            : localMatch.status,
        reviewedBy:
          remoteHasReviewData || !localMatch
            ? absence.reviewedBy
            : localMatch.reviewedBy,
        reviewedAt:
          remoteHasReviewData || !localMatch
            ? absence.reviewedAt
            : localMatch.reviewedAt,
        reviewNote:
          remoteHasReviewData || !localMatch
            ? absence.reviewNote
            : localMatch.reviewNote,
        slaDueAt:
          remoteHasReviewData || !localMatch
            ? absence.slaDueAt
            : localMatch.slaDueAt
      })
    );
  });

  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fetchRemoteAbsenceJustifications(
  employeeId?: string
): Promise<AbsenceJustification[] | null> {
  const client = supabase;
  if (!client) return null;
  if (employeeId && !isUuid(employeeId)) return null;

  const buildQuery = (selectClause: string) => {
    let query = client
      .from("absence_justifications")
      .select(selectClause)
      .order("created_at", { ascending: false })
      .limit(800);
    if (employeeId) {
      query = query.eq("user_id", employeeId);
    }
    return query;
  };

  const fullResult = await buildQuery(ABSENCE_SELECT_FULL);
  if (!fullResult.error && fullResult.data) {
    return (fullResult.data as unknown as DbAbsenceJustification[]).map(mapDbToLocal);
  }

  const baseResult = await buildQuery(ABSENCE_SELECT_BASE);
  if (baseResult.error || !baseResult.data) return null;
  return (baseResult.data as unknown as DbAbsenceJustification[]).map(mapDbToLocal);
}

async function insertRemoteAbsence(
  absence: AbsenceJustification,
  companyId: string
): Promise<AbsenceJustification | null> {
  if (!supabase) return null;

  const fullPayload = mapLocalToDbFull(absence, companyId);
  const fullInsert = await supabase
    .from("absence_justifications")
    .insert(fullPayload)
    .select(ABSENCE_SELECT_FULL)
    .single();

  if (!fullInsert.error && fullInsert.data) {
    return mapDbToLocal(fullInsert.data as DbAbsenceJustification);
  }

  const basePayload = mapLocalToDbBase(absence, companyId);
  const baseInsert = await supabase
    .from("absence_justifications")
    .insert(basePayload)
    .select(ABSENCE_SELECT_BASE)
    .single();

  if (baseInsert.error || !baseInsert.data) return null;
  return mapDbToLocal(baseInsert.data as DbAbsenceJustification);
}

export function readCachedAbsenceJustifications(employeeId?: string): AbsenceJustification[] {
  const all = readAllCachedAbsences();
  if (!employeeId) return all;
  return all.filter((item) => item.employeeId === employeeId);
}

export async function loadAbsenceJustifications(
  employeeId?: string
): Promise<AbsenceJustification[]> {
  const cached = readCachedAbsenceJustifications(employeeId);
  const remote = await fetchRemoteAbsenceJustifications(employeeId);
  if (!remote) return cached;

  const merged = mergeAbsences(readAllCachedAbsences(), remote);
  writeAllCachedAbsences(merged);
  if (!employeeId) return merged;
  return merged.filter((item) => item.employeeId === employeeId);
}

export async function appendAbsenceJustification(
  absence: AbsenceJustification
): Promise<AbsenceJustification> {
  const normalized = normalizeAbsence(absence);
  const cached = readAllCachedAbsences();
  writeAllCachedAbsences([normalized, ...cached]);

  if (!supabase || !isUuid(normalized.employeeId)) {
    return normalized;
  }

  const companyId = await resolveCompanyId(normalized.employeeId);
  if (!companyId) {
    return normalized;
  }

  const remoteInserted = await insertRemoteAbsence(normalized, companyId);
  if (!remoteInserted) {
    return normalized;
  }

  const remoteRecord = normalizeAbsence({
    ...remoteInserted,
    status: normalized.status,
    reviewedBy: normalized.reviewedBy,
    reviewedAt: normalized.reviewedAt,
    reviewNote: normalized.reviewNote,
    slaDueAt: normalized.slaDueAt
  });
  const next = readAllCachedAbsences().filter((item) => item.id !== normalized.id);
  next.push(remoteRecord);
  writeAllCachedAbsences(next);
  return remoteRecord;
}

export async function updateAbsenceJustificationStatus(
  absenceId: string,
  status: AbsenceApprovalStatus,
  input?: UpdateAbsenceStatusInput
): Promise<AbsenceJustification | null> {
  const current = readAllCachedAbsences();
  const existing = current.find((item) => item.id === absenceId);
  if (!existing) return null;

  const reviewedAt = input?.reviewedAt ?? new Date().toISOString();
  const updated = normalizeAbsence({
    ...existing,
    status,
    reviewedBy: status === "PENDING" ? undefined : input?.actorId ?? existing.reviewedBy,
    reviewedAt: status === "PENDING" ? undefined : reviewedAt,
    reviewNote: status === "PENDING" ? undefined : input?.reviewNote ?? existing.reviewNote
  });

  const next = current.map((item) => (item.id === absenceId ? updated : item));
  writeAllCachedAbsences(next);

  if (!supabase || !isUuid(absenceId)) {
    return updated;
  }

  const payload = {
    status: updated.status,
    reviewed_by:
      updated.reviewedBy && isUuid(updated.reviewedBy) ? updated.reviewedBy : null,
    reviewed_at: updated.reviewedAt ?? null,
    review_note: updated.reviewNote ?? null,
    sla_due_at: updated.slaDueAt ?? null
  };

  const remoteUpdate = await supabase
    .from("absence_justifications")
    .update(payload)
    .eq("id", absenceId)
    .select(ABSENCE_SELECT_FULL)
    .maybeSingle();

  if (remoteUpdate.error || !remoteUpdate.data) {
    return updated;
  }

  const remoteRecord = normalizeAbsence({
    ...mapDbToLocal(remoteUpdate.data as DbAbsenceJustification),
    status: updated.status,
    reviewedBy: updated.reviewedBy,
    reviewedAt: updated.reviewedAt,
    reviewNote: updated.reviewNote,
    slaDueAt: updated.slaDueAt
  });

  const finalNext = readAllCachedAbsences().map((item) =>
    item.id === absenceId ? remoteRecord : item
  );
  writeAllCachedAbsences(finalNext);
  return remoteRecord;
}

export async function syncPendingAbsenceJustifications(userId?: string): Promise<number> {
  if (!supabase) return 0;

  const cached = readAllCachedAbsences();
  const pendingSync = cached.filter((item) => {
    if (isUuid(item.id)) return false;
    if (!userId) return true;
    return item.employeeId === userId;
  });

  if (pendingSync.length === 0) return 0;

  let syncedCount = 0;
  const next = [...cached];

  for (const pending of pendingSync) {
    if (!isUuid(pending.employeeId)) continue;
    const companyId = await resolveCompanyId(pending.employeeId);
    if (!companyId) continue;

    const remoteInserted = await insertRemoteAbsence(pending, companyId);
    if (!remoteInserted) continue;

    const remote = normalizeAbsence({
      ...remoteInserted,
      status: pending.status,
      reviewedBy: pending.reviewedBy,
      reviewedAt: pending.reviewedAt,
      reviewNote: pending.reviewNote,
      slaDueAt: pending.slaDueAt
    });
    const index = next.findIndex((item) => item.id === pending.id);
    if (index >= 0) {
      next[index] = remote;
      remapTimeEntryId(`abs-entry-${pending.id}`, `abs-entry-${remote.id}`);
      syncedCount += 1;
    }
  }

  if (syncedCount > 0) {
    writeAllCachedAbsences(next);
  }

  return syncedCount;
}
