import { isUuid, resolveCompanyId } from "./profileRepo";
import { createSignedUrl, dataUrlToBlob, uploadUserFile } from "./storageClient";
import { supabase } from "./supabase";

export type TimeEntryType =
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | "ABSENCE"
  | "CERTIFICATE";

export type TimeEntryStatus = "PENDING" | "SYNCED" | "REJECTED";
export type ExternalPunchType =
  | "HOME_OFFICE"
  | "EXTERNAL_VISIT"
  | "FIELD_SERVICE"
  | "OTHER";

export type TimeEntryRecord = {
  id: string;
  userId?: string;
  type: TimeEntryType;
  timestamp: string;
  location?: string;
  coordinates?: { lat: number; lng: number };
  photoUrl?: string;
  photoPath?: string;
  status?: TimeEntryStatus;
  hash?: string;
  deviceInfo?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  correctedEntryId?: string;
  correctionReason?: string;
  siteId?: string;
  siteTimezone?: string;
  outsideGeofence?: boolean;
  externalPunch?: boolean;
  externalType?: ExternalPunchType;
  externalNote?: string;
  intervalType?: "LUNCH" | "DINNER" | "SNACK_AM" | "SNACK_PM";
  scheduleId?: string;
  scheduleIntervalId?: string;
  scheduleViolation?: boolean;
  scheduleNote?: string;
};

const ENTRIES_KEY = "portal.time_entries";
const LAST_PUNCH_KEY = "portal.lastPunch";

function buildSeedTimeEntries(): TimeEntryRecord[] {
  const at = (daysAgo: number, hour: number, minute: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  return [
    {
      id: "seed-te-demo-in-1",
      userId: "demo",
      type: "CLOCK_IN",
      timestamp: at(1, 8, 4),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED"
    },
    {
      id: "seed-te-demo-break-start-1",
      userId: "demo",
      type: "BREAK_START",
      timestamp: at(1, 12, 2),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED",
      intervalType: "LUNCH"
    },
    {
      id: "seed-te-demo-break-end-1",
      userId: "demo",
      type: "BREAK_END",
      timestamp: at(1, 13, 0),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED",
      intervalType: "LUNCH"
    },
    {
      id: "seed-te-demo-out-1",
      userId: "demo",
      type: "CLOCK_OUT",
      timestamp: at(1, 17, 36),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED"
    },
    {
      id: "seed-te-e01-in-2",
      userId: "e01",
      type: "CLOCK_IN",
      timestamp: at(2, 8, 1),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED"
    },
    {
      id: "seed-te-e01-out-2",
      userId: "e01",
      type: "CLOCK_OUT",
      timestamp: at(2, 17, 10),
      location: "Filial Centro",
      status: "SYNCED",
      source: "SEED"
    },
    {
      id: "seed-te-e03-in-3",
      userId: "e03",
      type: "CLOCK_IN",
      timestamp: at(3, 8, 11),
      location: "Filial Norte",
      status: "SYNCED",
      source: "SEED"
    },
    {
      id: "seed-te-e03-out-3",
      userId: "e03",
      type: "CLOCK_OUT",
      timestamp: at(3, 16, 50),
      location: "Filial Norte",
      status: "SYNCED",
      source: "SEED"
    }
  ];
}

function ensureDemoSeedTimeEntries(entries: TimeEntryRecord[]): TimeEntryRecord[] {
  const hasDemoEntries = entries.some((entry) => entry.userId === "demo");
  if (hasDemoEntries) return sortByTimestampDesc(entries);

  const merged = new Map<string, TimeEntryRecord>();
  entries.forEach((entry) => merged.set(entry.id, entry));
  buildSeedTimeEntries().forEach((entry) => merged.set(entry.id, entry));
  return sortByTimestampDesc(Array.from(merged.values()));
}

type DbTimeEntry = {
  id: string;
  user_id: string;
  type: TimeEntryType;
  timestamp: string;
  location_text: string | null;
  coordinates: unknown;
  photo_url: string | null;
  photo_path: string | null;
  status: TimeEntryStatus;
  hash_integrity: string | null;
  device_info: string | null;
  source: string | null;
  corrected_entry_id: string | null;
  correction_reason: string | null;
  site_id: string | null;
  site_timezone: string | null;
  outside_geofence: boolean | null;
  external_punch: boolean | null;
  external_type: ExternalPunchType | null;
  external_note: string | null;
  interval_type: "LUNCH" | "DINNER" | "SNACK_AM" | "SNACK_PM" | null;
  schedule_id: string | null;
  schedule_interval_id: string | null;
  schedule_violation: boolean | null;
  schedule_note: string | null;
};

function parseEntries(raw: string | null): TimeEntryRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is TimeEntryRecord => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as TimeEntryRecord;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.type === "string" &&
        typeof candidate.timestamp === "string"
      );
    });
  } catch {
    return [];
  }
}

function sortByTimestampDesc(entries: TimeEntryRecord[]): TimeEntryRecord[] {
  return [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function readCachedTimeEntries(): TimeEntryRecord[] {
  try {
    const parsed = parseEntries(localStorage.getItem(ENTRIES_KEY));
    const seeded = ensureDemoSeedTimeEntries(parsed);
    if (!parsed.some((entry) => entry.userId === "demo")) {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(seeded));
    }
    return seeded;
  } catch {
    const seeded = ensureDemoSeedTimeEntries([]);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeCachedTimeEntries(entries: TimeEntryRecord[]): TimeEntryRecord[] {
  const sorted = sortByTimestampDesc(entries);
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(sorted));
  return sorted;
}

function mapDbEntryToLocal(db: DbTimeEntry): TimeEntryRecord {
  const coords =
    typeof db.coordinates === "object" && db.coordinates !== null
      ? (db.coordinates as { lat?: unknown; lng?: unknown })
      : null;

  return {
    id: db.id,
    userId: db.user_id,
    type: db.type,
    timestamp: db.timestamp,
    location: db.location_text ?? undefined,
    coordinates:
      typeof coords?.lat === "number" && typeof coords?.lng === "number"
        ? { lat: coords.lat, lng: coords.lng }
        : undefined,
    photoUrl: db.photo_url ?? undefined,
    photoPath: db.photo_path ?? undefined,
    status: db.status,
    hash: db.hash_integrity ?? undefined,
    deviceInfo: db.device_info ?? undefined,
    source: db.source ?? undefined,
    correctedEntryId: db.corrected_entry_id ?? undefined,
    correctionReason: db.correction_reason ?? undefined,
    siteId: db.site_id ?? undefined,
    siteTimezone: db.site_timezone ?? undefined,
    outsideGeofence:
      typeof db.outside_geofence === "boolean" ? db.outside_geofence : undefined,
    externalPunch:
      typeof db.external_punch === "boolean" ? db.external_punch : undefined,
    externalType: db.external_type ?? undefined,
    externalNote: db.external_note ?? undefined,
    intervalType: db.interval_type ?? undefined,
    scheduleId: db.schedule_id ?? undefined,
    scheduleIntervalId: db.schedule_interval_id ?? undefined,
    scheduleViolation:
      typeof db.schedule_violation === "boolean" ? db.schedule_violation : undefined,
    scheduleNote: db.schedule_note ?? undefined
  };
}

function mergeEntries(localEntries: TimeEntryRecord[], remoteEntries: TimeEntryRecord[]): TimeEntryRecord[] {
  const merged = new Map<string, TimeEntryRecord>();
  localEntries.forEach((entry) => merged.set(entry.id, entry));
  remoteEntries.forEach((entry) => merged.set(entry.id, entry));
  return sortByTimestampDesc(Array.from(merged.values()));
}

function mapLocalEntryToDb(
  entry: TimeEntryRecord,
  companyId: string
): Omit<DbTimeEntry, "id"> & { company_id: string } {
  return {
    company_id: companyId,
    user_id: entry.userId!,
    type: entry.type,
    timestamp: entry.timestamp,
    location_text: entry.location ?? null,
    coordinates: entry.coordinates ?? null,
    photo_url: entry.photoPath ? null : entry.photoUrl ?? null,
    photo_path: entry.photoPath ?? null,
    status: entry.status ?? "PENDING",
    hash_integrity: entry.hash ?? null,
    device_info: entry.deviceInfo ?? null,
    source: entry.source ?? "WEB",
    corrected_entry_id: entry.correctedEntryId && isUuid(entry.correctedEntryId) ? entry.correctedEntryId : null,
    correction_reason: entry.correctionReason?.trim() ? entry.correctionReason.trim() : null,
    site_id: entry.siteId && isUuid(entry.siteId) ? entry.siteId : null,
    site_timezone: entry.siteTimezone?.trim() ? entry.siteTimezone.trim() : null,
    outside_geofence: Boolean(entry.outsideGeofence),
    external_punch: Boolean(entry.externalPunch),
    external_type: entry.externalType ?? null,
    external_note: entry.externalNote?.trim() ? entry.externalNote.trim() : null,
    interval_type: entry.intervalType ?? null,
    schedule_id: entry.scheduleId && isUuid(entry.scheduleId) ? entry.scheduleId : null,
    schedule_interval_id:
      entry.scheduleIntervalId && isUuid(entry.scheduleIntervalId) ? entry.scheduleIntervalId : null,
    schedule_violation: Boolean(entry.scheduleViolation),
    schedule_note: entry.scheduleNote?.trim() ? entry.scheduleNote.trim() : null
  };
}

async function fetchRemoteEntries(userId?: string): Promise<TimeEntryRecord[] | null> {
  if (!supabase) return null;
  if (userId && !isUuid(userId)) return null;

  let query = supabase
    .from("time_entries")
    .select(
      "id, user_id, type, timestamp, location_text, coordinates, photo_url, photo_path, status, hash_integrity, device_info, source, corrected_entry_id, correction_reason, site_id, site_timezone, outside_geofence, external_punch, external_type, external_note, interval_type, schedule_id, schedule_interval_id, schedule_violation, schedule_note"
    )
    .order("timestamp", { ascending: false })
    .limit(1500);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error || !data) return null;
  const mapped = (data as DbTimeEntry[]).map(mapDbEntryToLocal);
  return hydrateEntryPhotoUrls(mapped);
}

export async function loadTimeEntries(options?: {
  userId?: string;
  forceRemote?: boolean;
}): Promise<TimeEntryRecord[]> {
  const cached = readCachedTimeEntries();
  if (!supabase && !options?.forceRemote) return cached;

  const remote = await fetchRemoteEntries(options?.userId);
  if (!remote) {
    return hydrateEntryPhotoUrls(cached);
  }

  const merged = mergeEntries(cached, remote);
  const hydrated = await hydrateEntryPhotoUrls(merged);
  writeCachedTimeEntries(hydrated);
  const latestPunch = readLastPunchForUser(options?.userId);
  if (latestPunch) {
    persistLastPunch(latestPunch);
  }
  return hydrated;
}

async function hydrateEntryPhotoUrls(
  entries: TimeEntryRecord[]
): Promise<TimeEntryRecord[]> {
  if (!supabase) return entries;
  const hydrated = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.photoPath || entry.photoUrl) return entry;
      const signed = await createSignedUrl("punch-photos", entry.photoPath);
      if (!signed) return entry;
      return { ...entry, photoUrl: signed };
    })
  );
  return hydrated;
}

export async function uploadTimeEntryPhoto(
  userId: string | null | undefined,
  dataUrl: string
): Promise<{ photoPath: string; photoUrl?: string } | null> {
  if (!userId || !supabase || !isUuid(userId)) return null;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) {
    throw new Error("Falha ao converter a foto.");
  }

  const fileName = `ponto-${Date.now()}.jpg`;
  const result = await uploadUserFile({
    userId,
    bucket: "punch-photos",
    file: blob,
    fileName,
    prefix: "punch",
    contentType: blob.type || "image/jpeg"
  });
  if (!result) return null;
  return {
    photoPath: result.path,
    photoUrl: result.signedUrl
  };
}

export function readLastPunchForUser(userId?: string): TimeEntryRecord | null {
  const entries = readCachedTimeEntries()
    .filter((entry) => {
      if (!userId) return true;
      return entry.userId === userId;
    })
    .filter((entry) =>
      entry.type === "CLOCK_IN" ||
      entry.type === "CLOCK_OUT" ||
      entry.type === "BREAK_START" ||
      entry.type === "BREAK_END"
    );

  if (entries.length === 0) return null;
  return sortByTimestampDesc(entries)[0];
}

function persistLastPunch(entry: TimeEntryRecord) {
  localStorage.setItem(
    LAST_PUNCH_KEY,
    JSON.stringify({
      type: entry.type,
      timestamp: entry.timestamp
    })
  );
}

export async function appendTimeEntry(entry: TimeEntryRecord): Promise<TimeEntryRecord> {
  const cached = readCachedTimeEntries();
  const provisional = writeCachedTimeEntries([...cached, entry]);
  const insertedLocal = provisional.find((item) => item.id === entry.id) ?? entry;

  if (!entry.userId || !supabase || !isUuid(entry.userId)) {
    persistLastPunch(insertedLocal);
    return insertedLocal;
  }

  const companyId = await resolveCompanyId(entry.userId);
  if (!companyId) {
    persistLastPunch(insertedLocal);
    return insertedLocal;
  }

  const payload = mapLocalEntryToDb(insertedLocal, companyId);

  const { data, error } = await supabase
    .from("time_entries")
    .insert(payload)
    .select(
      "id, user_id, type, timestamp, location_text, coordinates, photo_url, photo_path, status, hash_integrity, device_info, source, corrected_entry_id, correction_reason, site_id, site_timezone, outside_geofence, external_punch, external_type, external_note, interval_type, schedule_id, schedule_interval_id, schedule_violation, schedule_note"
    )
    .single();

  if (error || !data) {
    const pendingEntry = {
      ...insertedLocal,
      status: insertedLocal.status === "REJECTED" ? "REJECTED" : "PENDING"
    } satisfies TimeEntryRecord;
    const next = readCachedTimeEntries().map((item) =>
      item.id === insertedLocal.id ? pendingEntry : item
    );
    writeCachedTimeEntries(next);
    persistLastPunch(pendingEntry);
    return pendingEntry;
  }

  const synced = mapDbEntryToLocal(data as DbTimeEntry);
  const hydrated = await hydrateEntryPhotoUrls([synced]);
  const syncedWithUrl = hydrated[0] ?? synced;
  const next = readCachedTimeEntries().filter((item) => item.id !== insertedLocal.id);
  next.push(syncedWithUrl);
  writeCachedTimeEntries(next);
  persistLastPunch(syncedWithUrl);
  return syncedWithUrl;
}

export async function updateTimeEntryStatus(
  entryId: string,
  status: TimeEntryStatus
): Promise<TimeEntryRecord | null> {
  const current = readCachedTimeEntries();
  const existing = current.find((item) => item.id === entryId);
  if (!existing) return null;

  const updatedLocal: TimeEntryRecord = { ...existing, status };
  const localUpdatedList = current.map((item) =>
    item.id === entryId ? updatedLocal : item
  );
  writeCachedTimeEntries(localUpdatedList);

  if (!supabase || !isUuid(entryId)) {
    return updatedLocal;
  }

  const { data, error } = await supabase
    .from("time_entries")
    .update({ status })
    .eq("id", entryId)
    .select(
      "id, user_id, type, timestamp, location_text, coordinates, photo_url, photo_path, status, hash_integrity, device_info, source, corrected_entry_id, correction_reason, site_id, site_timezone, outside_geofence, external_punch, external_type, external_note, interval_type, schedule_id, schedule_interval_id, schedule_violation, schedule_note"
    )
    .maybeSingle();

  if (error || !data) {
    return updatedLocal;
  }

  const remoteUpdated = mapDbEntryToLocal(data as DbTimeEntry);
  const hydrated = await hydrateEntryPhotoUrls([remoteUpdated]);
  const remoteWithUrl = hydrated[0] ?? remoteUpdated;
  const next = readCachedTimeEntries().map((item) =>
    item.id === entryId ? remoteWithUrl : item
  );
  writeCachedTimeEntries(next);
  return remoteWithUrl;
}

export async function syncPendingTimeEntries(userId?: string): Promise<number> {
  if (!supabase) return 0;

  const current = readCachedTimeEntries();
  const pendingEntries = current.filter((entry) => {
    const isPending = entry.status === "PENDING";
    if (!isPending) return false;
    if (!userId) return true;
    return entry.userId === userId;
  });

  if (pendingEntries.length === 0) return 0;

  let syncedCount = 0;
  const nextEntries = [...current];

  for (const pending of pendingEntries) {
    if (!pending.userId || !isUuid(pending.userId)) continue;
    const companyId = await resolveCompanyId(pending.userId);
    if (!companyId) continue;

    const payload = mapLocalEntryToDb(pending, companyId);
    const { data, error } = await supabase
    .from("time_entries")
    .insert(payload)
    .select(
      "id, user_id, type, timestamp, location_text, coordinates, photo_url, photo_path, status, hash_integrity, device_info, source, corrected_entry_id, correction_reason, site_id, site_timezone, outside_geofence, external_punch, external_type, external_note, interval_type, schedule_id, schedule_interval_id, schedule_violation, schedule_note"
    )
      .single();

    if (error || !data) continue;

    const syncedRecord = mapDbEntryToLocal(data as DbTimeEntry);
    const hydrated = await hydrateEntryPhotoUrls([syncedRecord]);
    const syncedWithUrl = hydrated[0] ?? syncedRecord;
    const index = nextEntries.findIndex((item) => item.id === pending.id);
    if (index >= 0) {
      nextEntries[index] = syncedWithUrl;
      syncedCount += 1;
    }
  }

  if (syncedCount > 0) {
    writeCachedTimeEntries(nextEntries);
    const latest = readLastPunchForUser(userId);
    if (latest) {
      persistLastPunch(latest);
    }
  }

  return syncedCount;
}

export function remapTimeEntryId(oldId: string, newId: string): boolean {
  if (!oldId || !newId || oldId === newId) return false;
  const current = readCachedTimeEntries();
  const exists = current.some((item) => item.id === oldId);
  if (!exists) return false;

  const withoutTarget = current.filter((item) => item.id !== newId);
  const remapped = withoutTarget.map((item) =>
    item.id === oldId ? { ...item, id: newId } : item
  );
  writeCachedTimeEntries(remapped);
  return true;
}
