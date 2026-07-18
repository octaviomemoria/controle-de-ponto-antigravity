import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const SCHEDULES_KEY = "portal.work_schedules";
const INTERVALS_KEY = "portal.work_intervals";
const PROFILE_SCHEDULE_KEY = "portal.profile.schedule";

export type IntervalType = "LUNCH" | "DINNER" | "SNACK_AM" | "SNACK_PM";

export type WorkSchedule = {
  id: string;
  name: string;
  timezone: string;
  shiftStart: string;
  shiftEnd: string;
  defaultToleranceMin: number;
  isDefault: boolean;
};

export type WorkInterval = {
  id: string;
  scheduleId: string;
  type: IntervalType;
  windowStart: string;
  windowEnd: string;
  durationMin: number;
  toleranceMin?: number;
};

export type WorkScheduleInput = Omit<WorkSchedule, "id"> & { id?: string };
export type WorkIntervalInput = Omit<WorkInterval, "id" | "scheduleId"> & { id?: string };

type DbSchedule = {
  id: string;
  company_id: string;
  name: string;
  timezone: string | null;
  shift_start: string;
  shift_end: string;
  default_tolerance_min: number | null;
  is_default: boolean | null;
  created_at: string;
  updated_at: string;
};

type DbInterval = {
  id: string;
  schedule_id: string;
  type: IntervalType;
  window_start: string;
  window_end: string;
  duration_min: number;
  tolerance_min: number | null;
  created_at: string;
};

type ProfileScheduleMap = Record<string, string>;

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const DEFAULT_SCHEDULE: WorkScheduleInput = {
  name: "Jornada Padrao",
  timezone: DEFAULT_TIMEZONE,
  shiftStart: "08:00",
  shiftEnd: "17:00",
  defaultToleranceMin: 10,
  isDefault: true
};

const DEFAULT_INTERVALS: Array<WorkIntervalInput & { type: IntervalType }> = [
  {
    type: "LUNCH",
    windowStart: "12:00",
    windowEnd: "13:30",
    durationMin: 60,
    toleranceMin: 10
  }
];

export function intervalTypeLabel(type: IntervalType, short = false): string {
  switch (type) {
    case "LUNCH":
      return short ? "Almoco" : "Intervalo para almoco";
    case "DINNER":
      return short ? "Janta" : "Intervalo para janta";
    case "SNACK_AM":
      return short ? "Lanche manha" : "Lanche da manha";
    case "SNACK_PM":
      return short ? "Lanche tarde" : "Lanche da tarde";
    default:
      return short ? "Intervalo" : "Intervalo";
  }
}

function generateLocalScheduleId(): string {
  return `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateLocalIntervalId(): string {
  return `interval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const parts = trimmed.split(":");
  if (parts.length < 2) return fallback;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  const safeHour = Math.min(23, Math.max(0, Math.floor(hour)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(minute)));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function normalizeTolerance(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(180, Math.round(parsed)));
}

function normalizeDuration(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(240, Math.round(parsed)));
}

function normalizeSchedule(input: Partial<WorkScheduleInput>): WorkSchedule | null {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return null;
  return {
    id: input.id && typeof input.id === "string" ? input.id : generateLocalScheduleId(),
    name,
    timezone:
      typeof input.timezone === "string" && input.timezone.trim()
        ? input.timezone.trim()
        : DEFAULT_TIMEZONE,
    shiftStart: normalizeTime(input.shiftStart, DEFAULT_SCHEDULE.shiftStart),
    shiftEnd: normalizeTime(input.shiftEnd, DEFAULT_SCHEDULE.shiftEnd),
    defaultToleranceMin: normalizeTolerance(
      input.defaultToleranceMin,
      DEFAULT_SCHEDULE.defaultToleranceMin
    ),
    isDefault: Boolean(input.isDefault)
  };
}

function normalizeInterval(
  input: Partial<WorkIntervalInput> & { scheduleId?: string; type?: IntervalType }
): WorkInterval | null {
  if (!input.type) return null;
  const scheduleId = typeof input.scheduleId === "string" ? input.scheduleId : "";
  if (!scheduleId) return null;
  return {
    id: input.id && typeof input.id === "string" ? input.id : generateLocalIntervalId(),
    scheduleId,
    type: input.type,
    windowStart: normalizeTime(input.windowStart, "12:00"),
    windowEnd: normalizeTime(input.windowEnd, "13:00"),
    durationMin: normalizeDuration(input.durationMin, 60),
    toleranceMin:
      input.toleranceMin === undefined ? undefined : normalizeTolerance(input.toleranceMin, 10)
  };
}

function parseScheduleArray(raw: string | null): WorkSchedule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        return normalizeSchedule(item as Partial<WorkScheduleInput>);
      })
      .filter((item): item is WorkSchedule => item !== null);
  } catch {
    return [];
  }
}

function parseIntervalArray(raw: string | null): WorkInterval[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const candidate = item as Partial<WorkIntervalInput> & {
          scheduleId?: string;
          type?: IntervalType;
        };
        return normalizeInterval(candidate);
      })
      .filter((item): item is WorkInterval => item !== null);
  } catch {
    return [];
  }
}

function writeSchedules(schedules: WorkSchedule[]): WorkSchedule[] {
  const next = [...schedules].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(next));
  return next;
}

function writeIntervals(intervals: WorkInterval[]): WorkInterval[] {
  const next = [...intervals].sort((a, b) => {
    if (a.scheduleId !== b.scheduleId) return a.scheduleId.localeCompare(b.scheduleId);
    return a.type.localeCompare(b.type);
  });
  localStorage.setItem(INTERVALS_KEY, JSON.stringify(next));
  return next;
}

function readProfileScheduleMap(): ProfileScheduleMap {
  try {
    const raw = localStorage.getItem(PROFILE_SCHEDULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ProfileScheduleMap;
  } catch {
    return {};
  }
}

function writeProfileScheduleMap(map: ProfileScheduleMap) {
  localStorage.setItem(PROFILE_SCHEDULE_KEY, JSON.stringify(map));
}

function seedDemoSchedule() {
  const schedules = parseScheduleArray(localStorage.getItem(SCHEDULES_KEY));
  if (schedules.length > 0) return;
  if (supabase) return;
  const schedule = normalizeSchedule(DEFAULT_SCHEDULE);
  if (!schedule) return;
  writeSchedules([schedule]);
  const intervals = DEFAULT_INTERVALS.map((interval) =>
    normalizeInterval({
      ...interval,
      scheduleId: schedule.id
    })
  ).filter((item): item is WorkInterval => item !== null);
  writeIntervals(intervals);
}

function mapDbSchedule(row: DbSchedule): WorkSchedule | null {
  return normalizeSchedule({
    id: row.id,
    name: row.name,
    timezone: row.timezone ?? DEFAULT_TIMEZONE,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    defaultToleranceMin: row.default_tolerance_min ?? DEFAULT_SCHEDULE.defaultToleranceMin,
    isDefault: row.is_default ?? false
  });
}

function mapDbInterval(row: DbInterval): WorkInterval | null {
  return normalizeInterval({
    id: row.id,
    scheduleId: row.schedule_id,
    type: row.type,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    durationMin: row.duration_min,
    toleranceMin: row.tolerance_min ?? undefined
  });
}

export function readCachedWorkSchedules(): WorkSchedule[] {
  seedDemoSchedule();
  return parseScheduleArray(localStorage.getItem(SCHEDULES_KEY));
}

export function readCachedWorkIntervals(scheduleId?: string): WorkInterval[] {
  seedDemoSchedule();
  const all = parseIntervalArray(localStorage.getItem(INTERVALS_KEY));
  if (!scheduleId) return all;
  return all.filter((item) => item.scheduleId === scheduleId);
}

export function readProfileScheduleId(profileId: string): string | null {
  if (!profileId) return null;
  const map = readProfileScheduleMap();
  return map[profileId] ?? null;
}

export async function loadWorkSchedules(
  userId?: string,
  companyIdOverride?: string | null
): Promise<WorkSchedule[]> {
  seedDemoSchedule();
  const cached = readCachedWorkSchedules();
  if (!supabase) return cached;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return cached;

  const { data, error } = await supabase
    .from("work_schedules")
    .select(
      "id, company_id, name, timezone, shift_start, shift_end, default_tolerance_min, is_default, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error || !data) return cached;
  const remote = (data as DbSchedule[])
    .map(mapDbSchedule)
    .filter((item): item is WorkSchedule => item !== null);

  const merged = new Map<string, WorkSchedule>();
  cached.forEach((item) => merged.set(item.id, item));
  remote.forEach((item) => merged.set(item.id, item));
  return writeSchedules(Array.from(merged.values()));
}

export async function loadWorkIntervals(
  scheduleId: string,
  userId?: string,
  companyIdOverride?: string | null
): Promise<WorkInterval[]> {
  seedDemoSchedule();
  const cached = readCachedWorkIntervals(scheduleId);
  if (!supabase) return cached;
  if (!isUuid(scheduleId)) return cached;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return cached;

  const { data, error } = await supabase
    .from("work_intervals")
    .select("id, schedule_id, type, window_start, window_end, duration_min, tolerance_min, created_at")
    .eq("schedule_id", scheduleId)
    .order("created_at", { ascending: true });

  if (error || !data) return cached;
  const remote = (data as DbInterval[])
    .map(mapDbInterval)
    .filter((item): item is WorkInterval => item !== null);

  const withoutSchedule = readCachedWorkIntervals().filter(
    (item) => item.scheduleId !== scheduleId
  );
  writeIntervals([...withoutSchedule, ...remote]);
  return remote;
}

export async function saveWorkSchedule(
  userId: string | null | undefined,
  input: WorkScheduleInput,
  companyIdOverride?: string | null
): Promise<WorkSchedule | null> {
  const normalized = normalizeSchedule(input);
  if (!normalized) return null;

  const schedules = readCachedWorkSchedules();
  const next = schedules.map((schedule) => {
    if (schedule.id === normalized.id) return normalized;
    if (normalized.isDefault && schedule.isDefault) {
      return { ...schedule, isDefault: false };
    }
    return schedule;
  });
  if (!next.find((schedule) => schedule.id === normalized.id)) {
    next.push(normalized);
  }
  writeSchedules(next);

  if (!supabase || !userId) return normalized;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return normalized;

  const payload = {
    company_id: companyId,
    name: normalized.name,
    timezone: normalized.timezone,
    shift_start: normalized.shiftStart,
    shift_end: normalized.shiftEnd,
    default_tolerance_min: normalized.defaultToleranceMin,
    is_default: normalized.isDefault
  };

  let remote: WorkSchedule | null = null;
  if (isUuid(normalized.id)) {
    const { data, error } = await supabase
      .from("work_schedules")
      .update(payload)
      .eq("id", normalized.id)
      .select(
        "id, company_id, name, timezone, shift_start, shift_end, default_tolerance_min, is_default, created_at, updated_at"
      )
      .maybeSingle();
    if (!error && data) {
      remote = mapDbSchedule(data as DbSchedule);
    }
  } else {
    const { data, error } = await supabase
      .from("work_schedules")
      .insert(payload)
      .select(
        "id, company_id, name, timezone, shift_start, shift_end, default_tolerance_min, is_default, created_at, updated_at"
      )
      .single();
    if (!error && data) {
      remote = mapDbSchedule(data as DbSchedule);
    }
  }

  if (remote) {
    const replaced = readCachedWorkSchedules().map((schedule) =>
      schedule.id === normalized.id ? remote! : schedule
    );
    writeSchedules(replaced);
    if (remote.isDefault) {
      void supabase
        .from("work_schedules")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .neq("id", remote.id);
    }
    return remote;
  }

  return normalized;
}

export async function saveWorkIntervals(
  userId: string | null | undefined,
  scheduleId: string,
  intervals: WorkIntervalInput[],
  companyIdOverride?: string | null
): Promise<WorkInterval[]> {
  const normalized = intervals
    .map((interval) =>
      normalizeInterval({
        ...interval,
        scheduleId
      })
    )
    .filter((item): item is WorkInterval => item !== null);

  const remaining = readCachedWorkIntervals().filter(
    (item) => item.scheduleId !== scheduleId
  );
  writeIntervals([...remaining, ...normalized]);

  if (!supabase || !isUuid(scheduleId)) return normalized;

  const companyId = await resolveCompanyId(userId, companyIdOverride);
  if (!companyId) return normalized;

  await supabase.from("work_intervals").delete().eq("schedule_id", scheduleId);
  if (normalized.length === 0) return normalized;

  const payload = normalized.map((interval) => ({
    schedule_id: scheduleId,
    type: interval.type,
    window_start: interval.windowStart,
    window_end: interval.windowEnd,
    duration_min: interval.durationMin,
    tolerance_min: interval.toleranceMin ?? null
  }));

  const { data, error } = await supabase
    .from("work_intervals")
    .insert(payload)
    .select("id, schedule_id, type, window_start, window_end, duration_min, tolerance_min, created_at");

  if (error || !data) return normalized;

  const remote = (data as DbInterval[])
    .map(mapDbInterval)
    .filter((item): item is WorkInterval => item !== null);
  const withoutSchedule = readCachedWorkIntervals().filter(
    (item) => item.scheduleId !== scheduleId
  );
  writeIntervals([...withoutSchedule, ...remote]);
  return remote;
}

export async function loadProfileScheduleId(
  profileId: string,
  actorUserId?: string
): Promise<string | null> {
  if (!profileId) return null;
  const local = readProfileScheduleId(profileId);
  if (!supabase || !isUuid(profileId)) return local;

  const { data, error } = await supabase
    .from("profiles")
    .select("schedule_id")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) return local;
  const scheduleId = typeof data.schedule_id === "string" ? data.schedule_id : null;
  if (scheduleId) {
    const map = readProfileScheduleMap();
    map[profileId] = scheduleId;
    writeProfileScheduleMap(map);
  }
  return scheduleId ?? local;
}

export async function saveProfileScheduleId(
  profileId: string,
  scheduleId: string,
  actorUserId?: string
): Promise<{ synced: boolean }> {
  if (!profileId) return { synced: false };
  const map = readProfileScheduleMap();
  map[profileId] = scheduleId;
  writeProfileScheduleMap(map);

  if (!supabase || !isUuid(profileId)) return { synced: false };

  const { error } = await supabase
    .from("profiles")
    .update({ schedule_id: scheduleId })
    .eq("id", profileId);

  return { synced: !error };
}

export async function resolveScheduleForProfile(
  profileId: string,
  actorUserId?: string
): Promise<{ schedule: WorkSchedule | null; intervals: WorkInterval[] }> {
  const schedules = await loadWorkSchedules(actorUserId ?? profileId);
  if (schedules.length === 0) {
    return { schedule: null, intervals: [] };
  }

  const profileScheduleId = await loadProfileScheduleId(profileId, actorUserId);
  const selected =
    schedules.find((schedule) => schedule.id === profileScheduleId) ??
    schedules.find((schedule) => schedule.isDefault) ??
    schedules[0];

  if (!selected) return { schedule: null, intervals: [] };
  const intervals = await loadWorkIntervals(selected.id, actorUserId ?? profileId);
  return { schedule: selected, intervals };
}
