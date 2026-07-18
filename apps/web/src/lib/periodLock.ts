const CLOSED_PERIODS_KEY = "portal.company.closedPeriods";

export type ClosedPeriod = {
  period: string; // YYYY-MM
  lockedAt: string;
  lockedBy?: string;
};

function isValidPeriod(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function normalizePeriod(value: string): string {
  if (!isValidPeriod(value)) return value;
  const [year, month] = value.split("-");
  return `${year}-${month.padStart(2, "0")}`;
}

export function formatPeriodId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getCurrentPeriodId(): string {
  return formatPeriodId(new Date());
}

export function readClosedPeriods(): ClosedPeriod[] {
  try {
    const raw = localStorage.getItem(CLOSED_PERIODS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ClosedPeriod => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as ClosedPeriod;
      return (
        typeof candidate.period === "string" &&
        isValidPeriod(candidate.period) &&
        typeof candidate.lockedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeClosedPeriods(periods: ClosedPeriod[]) {
  localStorage.setItem(CLOSED_PERIODS_KEY, JSON.stringify(periods));
}

export function isPeriodClosed(period: string): boolean {
  const normalizedPeriod = normalizePeriod(period);
  return readClosedPeriods().some((entry) => entry.period === normalizedPeriod);
}

export function setPeriodClosed(
  period: string,
  shouldClose: boolean,
  options?: { lockedBy?: string }
): ClosedPeriod[] {
  const normalizedPeriod = normalizePeriod(period);
  const current = readClosedPeriods();
  const withoutPeriod = current.filter((entry) => entry.period !== normalizedPeriod);
  if (!shouldClose) {
    writeClosedPeriods(withoutPeriod);
    return withoutPeriod;
  }

  const next: ClosedPeriod[] = [
    ...withoutPeriod,
    {
      period: normalizedPeriod,
      lockedAt: new Date().toISOString(),
      lockedBy: options?.lockedBy
    }
  ].sort((a, b) => a.period.localeCompare(b.period));

  writeClosedPeriods(next);
  return next;
}

export function isDateInClosedPeriod(date: Date): boolean {
  return isPeriodClosed(formatPeriodId(date));
}

export function isDateRangeInClosedPeriod(start: Date, end: Date): boolean {
  const from = new Date(start.getTime());
  const to = new Date(end.getTime());
  if (from.getTime() > to.getTime()) return false;

  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const limit = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor.getTime() <= limit.getTime()) {
    if (isPeriodClosed(formatPeriodId(cursor))) return true;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return false;
}

