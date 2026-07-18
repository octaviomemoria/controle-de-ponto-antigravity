import { getApprovalSlaState } from "./approvalSla";
import { readCachedAbsenceJustifications } from "./absenceRepo";
import { readCachedCertificates } from "./certificatesRepo";
import { getCurrentPeriodId, isPeriodClosed } from "./periodLock";
import type { Role } from "./roles";
import { readCachedTimeEntries } from "./timeEntriesRepo";

const NOTIFICATION_STORAGE_PREFIX = "portal.notifications.v1.";
const BROWSER_SEEN_STORAGE_PREFIX = "portal.notifications.browserSeen.";
const MAX_NOTIFICATIONS = 120;

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";
export type NotificationCategory =
  | "SYNC"
  | "APPROVAL"
  | "SLA"
  | "PERIOD"
  | "WORKFLOW";
export type NotificationStatus = "UNREAD" | "READ";

export type NotificationRecord = {
  id: string;
  key: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  linkTo?: string;
  createdAt: string;
  status: NotificationStatus;
  readAt?: string;
};

type OperationalNotificationSeed = {
  key: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  linkTo?: string;
};

function profileStorageKey(userId?: string): string {
  return `portal.profile.${userId ?? "anon"}`;
}

function notificationStorageKey(userId?: string): string {
  return `${NOTIFICATION_STORAGE_PREFIX}${userId ?? "anon"}`;
}

function browserSeenStorageKey(userId?: string): string {
  return `${BROWSER_SEEN_STORAGE_PREFIX}${userId ?? "anon"}`;
}

function createNotificationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseNotifications(raw: string | null): NotificationRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is NotificationRecord => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as NotificationRecord;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.key === "string" &&
        typeof candidate.title === "string" &&
        typeof candidate.message === "string" &&
        typeof candidate.createdAt === "string" &&
        (candidate.status === "UNREAD" || candidate.status === "READ")
      );
    });
  } catch {
    return [];
  }
}

function sortByCreatedAtDesc(items: NotificationRecord[]): NotificationRecord[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function writeNotifications(userId: string | undefined, items: NotificationRecord[]): NotificationRecord[] {
  const sorted = sortByCreatedAtDesc(items).slice(0, MAX_NOTIFICATIONS);
  localStorage.setItem(notificationStorageKey(userId), JSON.stringify(sorted));
  return sorted;
}

function buildSeedFingerprint(seed: OperationalNotificationSeed): string {
  return [
    seed.title,
    seed.message,
    seed.severity,
    seed.category,
    seed.linkTo ?? ""
  ].join("|");
}

function isWithinDays(timestamp: string | undefined, days: number): boolean {
  if (!timestamp) return false;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  const diffMs = Date.now() - parsed.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function countPendingTimeEntries(role: Role, userId: string): number {
  const punchTypes = new Set(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]);
  return readCachedTimeEntries().filter((entry) => {
    if (!punchTypes.has(entry.type)) return false;
    if (entry.status !== "PENDING") return false;
    if (role === "EMPLOYEE") return entry.userId === userId;
    return true;
  }).length;
}

function countPendingCertificates(role: Role, userId: string): number {
  return readCachedCertificates().filter((certificate) => {
    if (certificate.status !== "PENDING") return false;
    if (role === "EMPLOYEE") return certificate.userId === userId;
    return true;
  }).length;
}

function countPendingAbsences(role: Role, userId: string): number {
  return readCachedAbsenceJustifications().filter((absence) => {
    if (absence.status !== "PENDING") return false;
    if (role === "EMPLOYEE") return absence.employeeId === userId;
    return true;
  }).length;
}

function countOverdueApprovals(role: Role, userId: string): number {
  const pendingCertificatesOverdue = readCachedCertificates().filter((certificate) => {
    if (certificate.status !== "PENDING") return false;
    if (role === "EMPLOYEE") return false;
    return getApprovalSlaState(certificate.slaDueAt) === "OVERDUE";
  }).length;

  const pendingAbsencesOverdue = readCachedAbsenceJustifications().filter((absence) => {
    if (absence.status !== "PENDING") return false;
    if (role === "EMPLOYEE") return false;
    return getApprovalSlaState(absence.slaDueAt) === "OVERDUE";
  }).length;

  return pendingCertificatesOverdue + pendingAbsencesOverdue;
}

function countRecentRejections(userId: string): number {
  const rejectedCertificates = readCachedCertificates(userId).filter((certificate) => {
    if (certificate.status !== "REJECTED") return false;
    return isWithinDays(certificate.reviewedAt ?? certificate.createdAt, 7);
  }).length;

  const rejectedAbsences = readCachedAbsenceJustifications(userId).filter((absence) => {
    if (absence.status !== "REJECTED") return false;
    return isWithinDays(absence.reviewedAt ?? absence.createdAt, 7);
  }).length;

  return rejectedCertificates + rejectedAbsences;
}

function countRecentManualAdjustments(role: Role, userId: string): number {
  return readCachedTimeEntries().filter((entry) => {
    if (entry.source !== "MANUAL_ADJUSTMENT") return false;
    if (!isWithinDays(entry.timestamp, 14)) return false;
    if (role === "EMPLOYEE") return entry.userId === userId;
    return true;
  }).length;
}

function buildOperationalSeeds(role: Role, userId: string): OperationalNotificationSeed[] {
  const seeds: OperationalNotificationSeed[] = [];
  const pendingTimeEntries = countPendingTimeEntries(role, userId);
  if (pendingTimeEntries > 0) {
    seeds.push({
      key: "op:sync:pending_time_entries",
      title: "Sincronizacao pendente",
      message: `${pendingTimeEntries} registro(s) de ponto aguardando sincronizacao.`,
      severity: "WARNING",
      category: "SYNC",
      linkTo: "/home"
    });
  }

  const pendingCertificates = countPendingCertificates(role, userId);
  if (pendingCertificates > 0) {
    seeds.push({
      key: "op:approval:pending_certificates",
      title: "Atestados pendentes",
      message: `${pendingCertificates} atestado(s) aguardando analise.`,
      severity: role === "EMPLOYEE" ? "INFO" : "WARNING",
      category: "APPROVAL",
      linkTo: role === "EMPLOYEE" ? "/atestados" : "/dashboard"
    });
  }

  const pendingAbsences = countPendingAbsences(role, userId);
  if (pendingAbsences > 0) {
    seeds.push({
      key: "op:approval:pending_absences",
      title: "Abonos pendentes",
      message: `${pendingAbsences} abono(s) aguardando analise.`,
      severity: role === "EMPLOYEE" ? "INFO" : "WARNING",
      category: "APPROVAL",
      linkTo: role === "EMPLOYEE" ? "/historico" : "/dashboard"
    });
  }

  const overdueApprovals = countOverdueApprovals(role, userId);
  if (overdueApprovals > 0) {
    seeds.push({
      key: "op:sla:overdue_approvals",
      title: "SLA de aprovacao vencido",
      message: `${overdueApprovals} pendencia(s) com SLA vencido.`,
      severity: "CRITICAL",
      category: "SLA",
      linkTo: "/dashboard"
    });
  }

  if (isPeriodClosed(getCurrentPeriodId())) {
    seeds.push({
      key: "op:period:current_locked",
      title: "Periodo mensal fechado",
      message: "O periodo atual esta fechado para novas operacoes.",
      severity: "INFO",
      category: "PERIOD",
      linkTo: role === "EMPLOYEE" ? "/historico" : "/configuracoes-empresa"
    });
  }

  if (role === "EMPLOYEE") {
    const recentRejections = countRecentRejections(userId);
    if (recentRejections > 0) {
      seeds.push({
        key: "op:workflow:recent_rejections",
        title: "Solicitacao recusada",
        message: `${recentRejections} solicitacao(oes) recente(s) foi(foram) recusada(s).`,
        severity: "WARNING",
        category: "WORKFLOW",
        linkTo: "/atestados"
      });
    }
  }

  const recentManualAdjustments = countRecentManualAdjustments(role, userId);
  if (recentManualAdjustments > 0) {
    seeds.push({
      key: "op:workflow:manual_adjustments",
      title: "Ajustes manuais recentes",
      message: `${recentManualAdjustments} ajuste(s) manual(is) registrado(s) recentemente.`,
      severity: role === "EMPLOYEE" ? "INFO" : "WARNING",
      category: "WORKFLOW",
      linkTo: role === "EMPLOYEE" ? "/historico" : "/auditoria"
    });
  }

  return seeds;
}

export function readNotifications(userId?: string): NotificationRecord[] {
  try {
    return sortByCreatedAtDesc(
      parseNotifications(localStorage.getItem(notificationStorageKey(userId)))
    );
  } catch {
    return [];
  }
}

export function getUnreadNotificationsCount(userId?: string): number {
  return readNotifications(userId).filter((item) => item.status === "UNREAD").length;
}

export function refreshOperationalNotifications(userId: string, role: Role): NotificationRecord[] {
  const existing = readNotifications(userId);
  const existingByKey = new Map(existing.map((item) => [item.key, item]));
  const seeds = buildOperationalSeeds(role, userId);

  const nextOperationalItems = seeds.map((seed) => {
    const existingItem = existingByKey.get(seed.key);
    const existingFingerprint = existingItem
      ? buildSeedFingerprint({
          key: existingItem.key,
          title: existingItem.title,
          message: existingItem.message,
          severity: existingItem.severity,
          category: existingItem.category,
          linkTo: existingItem.linkTo
        })
      : null;
    const nextFingerprint = buildSeedFingerprint(seed);

    if (existingItem && existingFingerprint === nextFingerprint) {
      return existingItem;
    }

    return {
      id: createNotificationId(),
      key: seed.key,
      title: seed.title,
      message: seed.message,
      severity: seed.severity,
      category: seed.category,
      linkTo: seed.linkTo,
      createdAt: new Date().toISOString(),
      status: "UNREAD" as NotificationStatus
    };
  });

  const customItems = existing.filter((item) => !item.key.startsWith("op:"));
  return writeNotifications(userId, [...customItems, ...nextOperationalItems]);
}

export function markNotificationAsRead(userId: string | undefined, notificationId: string): NotificationRecord[] {
  const next = readNotifications(userId).map((item) => {
    if (item.id !== notificationId) return item;
    if (item.status === "READ") return item;
    return {
      ...item,
      status: "READ" as NotificationStatus,
      readAt: new Date().toISOString()
    };
  });
  return writeNotifications(userId, next);
}

export function markAllNotificationsAsRead(userId: string | undefined): NotificationRecord[] {
  const now = new Date().toISOString();
  const next = readNotifications(userId).map((item) =>
    item.status === "READ"
      ? item
      : {
          ...item,
          status: "READ" as NotificationStatus,
          readAt: now
        }
  );
  return writeNotifications(userId, next);
}

export function clearReadNotifications(userId: string | undefined): NotificationRecord[] {
  const unread = readNotifications(userId).filter((item) => item.status !== "READ");
  return writeNotifications(userId, unread);
}

export function readProfileNotificationsEnabled(userId?: string): boolean {
  try {
    const raw = localStorage.getItem(profileStorageKey(userId));
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { notificationsEnabled?: unknown };
    if (typeof parsed.notificationsEnabled === "boolean") {
      return parsed.notificationsEnabled;
    }
    return true;
  } catch {
    return true;
  }
}

function parseSeenIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export async function emitBrowserNotifications(
  userId: string | undefined,
  notifications: NotificationRecord[],
  notificationsEnabled: boolean
): Promise<number> {
  if (!notificationsEnabled) return 0;
  if (typeof window === "undefined" || typeof Notification === "undefined") return 0;
  if (Notification.permission !== "granted") return 0;

  const seenKey = browserSeenStorageKey(userId);
  const seen = new Set(parseSeenIds(localStorage.getItem(seenKey)));
  const candidates = notifications
    .filter((item) => item.status === "UNREAD" && item.severity !== "INFO")
    .filter((item) => !seen.has(item.id))
    .slice(0, 2);

  if (candidates.length === 0) return 0;

  candidates.forEach((item) => {
    seen.add(item.id);
    new Notification(item.title, {
      body: item.message,
      tag: item.id
    });
  });

  localStorage.setItem(seenKey, JSON.stringify(Array.from(seen).slice(-200)));
  return candidates.length;
}
