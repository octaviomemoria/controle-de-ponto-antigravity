export const DEFAULT_APPROVAL_SLA_HOURS = 48;

export type ApprovalSlaState = "ON_TIME" | "DUE_SOON" | "OVERDUE";

export function computeSlaDueAt(
  requestedAt: string,
  slaHours = DEFAULT_APPROVAL_SLA_HOURS
): string {
  const requestedDate = new Date(requestedAt);
  if (Number.isNaN(requestedDate.getTime())) {
    return new Date().toISOString();
  }
  return new Date(
    requestedDate.getTime() + Math.max(1, slaHours) * 60 * 60 * 1000
  ).toISOString();
}

export function getApprovalSlaState(
  dueAt?: string,
  referenceDate = new Date()
): ApprovalSlaState {
  if (!dueAt) return "ON_TIME";

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) return "ON_TIME";

  const diffMs = dueDate.getTime() - referenceDate.getTime();
  if (diffMs < 0) return "OVERDUE";
  if (diffMs <= 12 * 60 * 60 * 1000) return "DUE_SOON";
  return "ON_TIME";
}

export function formatSlaRemainingLabel(
  dueAt?: string,
  referenceDate = new Date()
): string {
  if (!dueAt) return "SLA indisponivel";

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) return "SLA indisponivel";

  const diffMs = dueDate.getTime() - referenceDate.getTime();
  const absoluteMinutes = Math.round(Math.abs(diffMs) / (1000 * 60));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const formatted = `${hours}h ${minutes}m`;

  if (diffMs < 0) return `SLA vencido ha ${formatted}`;
  return `SLA restante: ${formatted}`;
}
