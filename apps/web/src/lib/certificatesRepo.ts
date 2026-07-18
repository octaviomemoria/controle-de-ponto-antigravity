import { computeSlaDueAt } from "./approvalSla";
import { isUuid, resolveCompanyId } from "./profileRepo";
import { createSignedUrl, uploadUserFile } from "./storageClient";
import { supabase } from "./supabase";
import { remapTimeEntryId } from "./timeEntriesRepo";

const CERT_KEY = "portal.certificates";

export type CertificateStatus = "PENDING" | "APPROVED" | "REJECTED";

export type CertificateRecord = {
  id: string;
  userId?: string;
  startDate: string;
  endDate: string;
  reason: string;
  description: string;
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  status: CertificateStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  slaDueAt?: string;
  createdAt: string;
};

type DbCertificate = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  description: string | null;
  file_url: string | null;
  file_path: string | null;
  status: CertificateStatus;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
};

export type UpdateCertificateStatusInput = {
  actorId?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

function buildSeedCertificates(): CertificateRecord[] {
  const now = Date.now();
  const pendingCreatedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const approvedCreatedAt = new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "cert-seed-pending",
      userId: "demo",
      startDate: new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDate: new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      reason: "Consulta Medica",
      description: "Retorno ambulatorial.",
      status: "PENDING",
      slaDueAt: computeSlaDueAt(pendingCreatedAt),
      createdAt: pendingCreatedAt
    },
    {
      id: "cert-seed-approved",
      userId: "demo",
      startDate: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDate: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      reason: "Exames",
      description: "Atestado validado pelo gestor.",
      status: "APPROVED",
      reviewedBy: "manager-demo",
      reviewedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      reviewNote: "Documento conferido.",
      createdAt: approvedCreatedAt
    }
  ];
}

function ensureDemoSeedCertificates(certificates: CertificateRecord[]): CertificateRecord[] {
  const hasDemoData = certificates.some((certificate) => certificate.userId === "demo");
  if (hasDemoData) return certificates;
  const seed = buildSeedCertificates().map(normalizeCertificateRecord);
  return mergeCertificates(certificates, seed);
}

function parseCertificates(raw: string | null): CertificateRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CertificateRecord => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as CertificateRecord;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.startDate === "string" &&
        typeof candidate.endDate === "string" &&
        typeof candidate.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function sortByCreatedAtDesc(certificates: CertificateRecord[]): CertificateRecord[] {
  return [...certificates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function normalizeCertificateRecord(input: CertificateRecord): CertificateRecord {
  const normalized: CertificateRecord = {
    ...input,
    slaDueAt: input.slaDueAt ?? computeSlaDueAt(input.createdAt)
  };

  if (normalized.status === "PENDING") {
    delete normalized.reviewedBy;
    delete normalized.reviewedAt;
  }

  return normalized;
}

function readAllCachedCertificates(): CertificateRecord[] {
  try {
    const parsed = parseCertificates(localStorage.getItem(CERT_KEY));
    if (parsed.length > 0) return parsed;
    const seed = sortByCreatedAtDesc(buildSeedCertificates());
    localStorage.setItem(CERT_KEY, JSON.stringify(seed));
    return seed;
  } catch {
    return [];
  }
}

function writeAllCachedCertificates(certificates: CertificateRecord[]): CertificateRecord[] {
  const sorted = sortByCreatedAtDesc(certificates);
  localStorage.setItem(CERT_KEY, JSON.stringify(sorted));
  return sorted;
}

function mergeCertificates(
  localCertificates: CertificateRecord[],
  remoteCertificates: CertificateRecord[]
): CertificateRecord[] {
  const merged = new Map<string, CertificateRecord>();
  localCertificates.forEach((item) => merged.set(item.id, item));
  remoteCertificates.forEach((item) => {
    const existing = merged.get(item.id);
    merged.set(item.id, {
      ...item,
      fileName: existing?.fileName ?? item.fileName,
      filePath: item.filePath ?? existing?.filePath,
      reviewNote: existing?.reviewNote ?? item.reviewNote,
      slaDueAt: existing?.slaDueAt ?? item.slaDueAt
    });
  });
  return sortByCreatedAtDesc(Array.from(merged.values()));
}

function mapDbCertificateToLocal(db: DbCertificate): CertificateRecord {
  return {
    id: db.id,
    userId: db.user_id,
    startDate: db.start_date,
    endDate: db.end_date,
    reason: db.reason ?? "Outros",
    description: db.description ?? "",
    fileUrl: db.file_url ?? undefined,
    filePath: db.file_path ?? undefined,
    status: db.status,
    reviewedBy: db.validated_by ?? undefined,
    reviewedAt: db.validated_at ?? undefined,
    slaDueAt: computeSlaDueAt(db.created_at),
    createdAt: db.created_at
  };
}

function mapLocalCertificateToDb(certificate: CertificateRecord, companyId: string) {
  return {
    company_id: companyId,
    user_id: certificate.userId!,
    start_date: certificate.startDate,
    end_date: certificate.endDate,
    reason: certificate.reason,
    description: certificate.description || null,
    file_url: certificate.filePath ? null : certificate.fileUrl ?? null,
    file_path: certificate.filePath ?? null,
    status: certificate.status
  };
}

export function readCachedCertificates(userId?: string): CertificateRecord[] {
  const all = ensureDemoSeedCertificates(readAllCachedCertificates());
  if (!userId) return sortByCreatedAtDesc(all);
  return sortByCreatedAtDesc(
    all.filter((entry) => !entry.userId || entry.userId === userId)
  );
}

async function fetchRemoteCertificates(userId?: string): Promise<CertificateRecord[] | null> {
  if (!supabase) return null;
  if (userId && !isUuid(userId)) return null;

  let query = supabase
    .from("certificates")
    .select(
      "id, user_id, start_date, end_date, reason, description, file_url, file_path, status, validated_by, validated_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(800);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error || !data) return null;
  const mapped = (data as DbCertificate[]).map(mapDbCertificateToLocal);
  return hydrateCertificateFileUrls(mapped);
}

export async function loadCertificates(userId?: string): Promise<CertificateRecord[]> {
  const cached = readCachedCertificates(userId);
  const remote = await fetchRemoteCertificates(userId);
  if (!remote) {
    return hydrateCertificateFileUrls(cached);
  }

  const merged = mergeCertificates(cached, remote);
  writeAllCachedCertificates(merged);
  return merged;
}

async function hydrateCertificateFileUrls(
  certificates: CertificateRecord[]
): Promise<CertificateRecord[]> {
  if (!supabase) return certificates;

  const hydrated = await Promise.all(
    certificates.map(async (cert) => {
      if (!cert.filePath || cert.fileUrl) return cert;
      const signed = await createSignedUrl("certificates", cert.filePath);
      if (!signed) return cert;
      return { ...cert, fileUrl: signed };
    })
  );
  return hydrated;
}

export async function uploadCertificateFile(userId: string, file: File): Promise<{
  filePath: string;
  fileUrl?: string;
} | null> {
  const result = await uploadUserFile({
    userId,
    bucket: "certificates",
    file,
    fileName: file.name,
    prefix: "certificates",
    contentType: file.type
  });
  if (!result) return null;
  return {
    filePath: result.path,
    fileUrl: result.signedUrl
  };
}

export async function appendCertificate(certificate: CertificateRecord): Promise<CertificateRecord> {
  const normalized = normalizeCertificateRecord(certificate);
  const cached = readAllCachedCertificates();
  writeAllCachedCertificates([normalized, ...cached]);

  if (!normalized.userId || !supabase || !isUuid(normalized.userId)) {
    return normalized;
  }

  const companyId = await resolveCompanyId(normalized.userId);
  if (!companyId) {
    return normalized;
  }

  const payload = mapLocalCertificateToDb(normalized, companyId);
  const { data, error } = await supabase
    .from("certificates")
    .insert(payload)
    .select(
      "id, user_id, start_date, end_date, reason, description, file_url, file_path, status, validated_by, validated_at, created_at"
    )
    .single();

  if (error || !data) {
    return normalized;
  }

  const remoteRecord = mapDbCertificateToLocal(data as DbCertificate);
  const hydrated = await hydrateCertificateFileUrls([remoteRecord]);
  const remoteWithUrl = hydrated[0] ?? remoteRecord;
  const next = readAllCachedCertificates().filter((item) => item.id !== normalized.id);
  next.push({
    ...remoteWithUrl,
    fileName: normalized.fileName,
    reviewNote: normalized.reviewNote,
    slaDueAt: normalized.slaDueAt
  });
  writeAllCachedCertificates(next);
  return {
    ...remoteWithUrl,
    fileName: normalized.fileName,
    reviewNote: normalized.reviewNote,
    slaDueAt: normalized.slaDueAt
  };
}

export async function updateCertificateStatus(
  certificateId: string,
  status: CertificateStatus,
  input?: UpdateCertificateStatusInput
): Promise<CertificateRecord | null> {
  const cached = readAllCachedCertificates();
  const existing = cached.find((item) => item.id === certificateId);
  if (!existing) return null;

  const reviewedAt = input?.reviewedAt ?? new Date().toISOString();
  const updatedLocal = normalizeCertificateRecord({
    ...existing,
    status,
    reviewedBy: status === "PENDING" ? undefined : input?.actorId ?? existing.reviewedBy,
    reviewedAt: status === "PENDING" ? undefined : reviewedAt,
    reviewNote: status === "PENDING" ? undefined : input?.reviewNote ?? existing.reviewNote
  });
  const localUpdated = cached.map((item) =>
    item.id === certificateId ? updatedLocal : item
  );
  writeAllCachedCertificates(localUpdated);

  if (!supabase || !isUuid(certificateId)) {
    return updatedLocal;
  }

  const remotePatch: Record<string, unknown> = {
    status
  };

  if (status === "PENDING") {
    remotePatch.validated_by = null;
    remotePatch.validated_at = null;
  } else {
    remotePatch.validated_by =
      input?.actorId && isUuid(input.actorId) ? input.actorId : null;
    remotePatch.validated_at = reviewedAt;
  }

  const { data, error } = await supabase
    .from("certificates")
    .update(remotePatch)
    .eq("id", certificateId)
    .select(
      "id, user_id, start_date, end_date, reason, description, file_url, file_path, status, validated_by, validated_at, created_at"
    )
    .maybeSingle();

  if (error || !data) {
    return updatedLocal;
  }

  const remoteUpdated = mapDbCertificateToLocal(data as DbCertificate);
  const hydrated = await hydrateCertificateFileUrls([remoteUpdated]);
  const remoteWithUrl = hydrated[0] ?? remoteUpdated;
  const next = readAllCachedCertificates().map((item) =>
    item.id === certificateId
      ? {
          ...remoteWithUrl,
          fileName: existing.fileName,
          reviewNote: updatedLocal.reviewNote,
          slaDueAt: updatedLocal.slaDueAt
        }
      : item
  );
  writeAllCachedCertificates(next);
  return {
    ...remoteWithUrl,
    fileName: existing.fileName,
    reviewNote: updatedLocal.reviewNote,
    slaDueAt: updatedLocal.slaDueAt
  };
}

export async function syncPendingCertificates(userId?: string): Promise<number> {
  if (!supabase) return 0;

  const cached = readAllCachedCertificates();
  const pendingSync = cached.filter((item) => {
    if (isUuid(item.id)) return false;
    if (!userId) return true;
    return item.userId === userId;
  });

  if (pendingSync.length === 0) return 0;

  let syncedCount = 0;
  const next = [...cached];

  for (const pending of pendingSync) {
    if (!pending.userId || !isUuid(pending.userId)) continue;
    const companyId = await resolveCompanyId(pending.userId);
    if (!companyId) continue;

    const payload = mapLocalCertificateToDb(pending, companyId);
    const { data, error } = await supabase
      .from("certificates")
      .insert(payload)
      .select(
        "id, user_id, start_date, end_date, reason, description, file_url, file_path, status, validated_by, validated_at, created_at"
      )
      .single();

    if (error || !data) continue;

    const remote = mapDbCertificateToLocal(data as DbCertificate);
    const hydrated = await hydrateCertificateFileUrls([remote]);
    const remoteWithUrl = hydrated[0] ?? remote;
    const index = next.findIndex((item) => item.id === pending.id);
    if (index >= 0) {
      next[index] = {
        ...remoteWithUrl,
        fileName: pending.fileName,
        reviewNote: pending.reviewNote,
        slaDueAt: pending.slaDueAt
      };
      remapTimeEntryId(`cert-${pending.id}`, `cert-${remote.id}`);
      syncedCount += 1;
    }
  }

  if (syncedCount > 0) {
    writeAllCachedCertificates(next);
  }

  return syncedCount;
}
