import { readCachedCompanySettings } from "./companySettingsRepo";
import { readCachedCompanySites } from "./companySitesRepo";
import { isUuid, resolveCompanyId } from "./profileRepo";
import { supabase } from "./supabase";

const PROFILE_SITES_KEY = "portal.profile.site_assignments";

export type ProfileSiteAssignment = {
  id: string;
  companyId: string;
  profileId: string;
  siteId: string;
  createdAt: string;
};

export type SaveProfileSitesResult = {
  siteIds: string[];
  synced: boolean;
};

type DbProfileSiteAssignment = {
  id: string;
  company_id: string;
  profile_id: string;
  site_id: string;
  created_at: string;
};

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function generateLocalAssignmentId(): string {
  return `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dedupeSiteIds(siteIds: string[]): string[] {
  const unique = new Set<string>();
  siteIds.forEach((siteId) => {
    const normalized = normalizeText(siteId);
    if (normalized) unique.add(normalized);
  });
  return Array.from(unique);
}

function parseAssignments(raw: string | null): ProfileSiteAssignment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const candidate = item as Partial<ProfileSiteAssignment>;
        const id = normalizeText(candidate.id);
        const companyId = normalizeText(candidate.companyId, "demo-company");
        const profileId = normalizeText(candidate.profileId);
        const siteId = normalizeText(candidate.siteId);
        const createdAt = normalizeText(candidate.createdAt, new Date().toISOString());
        if (!id || !profileId || !siteId) return null;
        return {
          id,
          companyId,
          profileId,
          siteId,
          createdAt
        } satisfies ProfileSiteAssignment;
      })
      .filter((item): item is ProfileSiteAssignment => item !== null);
  } catch {
    return [];
  }
}

function writeAssignments(assignments: ProfileSiteAssignment[]): ProfileSiteAssignment[] {
  const sorted = [...assignments].sort((a, b) => {
    if (a.profileId !== b.profileId) return a.profileId.localeCompare(b.profileId);
    if (a.siteId !== b.siteId) return a.siteId.localeCompare(b.siteId);
    return a.createdAt.localeCompare(b.createdAt);
  });
  localStorage.setItem(PROFILE_SITES_KEY, JSON.stringify(sorted));
  return sorted;
}

function mapDbToLocal(row: DbProfileSiteAssignment): ProfileSiteAssignment {
  return {
    id: row.id,
    companyId: row.company_id,
    profileId: row.profile_id,
    siteId: row.site_id,
    createdAt: row.created_at
  };
}

export function readCachedProfileSiteAssignments(): ProfileSiteAssignment[] {
  try {
    return parseAssignments(localStorage.getItem(PROFILE_SITES_KEY));
  } catch {
    return [];
  }
}

export function readAssignedSiteIds(profileId: string): string[] {
  if (!profileId) return [];
  const assigned = readCachedProfileSiteAssignments()
    .filter((assignment) => assignment.profileId === profileId)
    .map((assignment) => assignment.siteId);

  if (assigned.length > 0) return assigned;
  if (supabase) return assigned;

  const settings = readCachedCompanySettings();
  if (settings.siteAccessPolicy !== "ASSIGNED_ONLY") return assigned;

  const activeSites = readCachedCompanySites().filter((site) => site.isActive);
  if (activeSites.length === 0) return assigned;

  const fallbackSite = activeSites[0];
  const nextAssignments = [
    ...readCachedProfileSiteAssignments(),
    {
      id: generateLocalAssignmentId(),
      companyId: "demo-company",
      profileId,
      siteId: fallbackSite.id,
      createdAt: new Date().toISOString()
    }
  ];
  writeAssignments(nextAssignments);
  return [fallbackSite.id];
}

export async function loadProfileSiteAssignments(
  profileId?: string,
  actorUserId?: string
): Promise<ProfileSiteAssignment[]> {
  const local = readCachedProfileSiteAssignments();
  if (!supabase) {
    if (!profileId) return local;
    return local.filter((assignment) => assignment.profileId === profileId);
  }

  const companyId = await resolveCompanyId(actorUserId ?? profileId);
  if (!companyId) {
    if (!profileId) return local;
    return local.filter((assignment) => assignment.profileId === profileId);
  }

  let query = supabase
    .from("profile_sites")
    .select("id, company_id, profile_id, site_id, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (profileId && isUuid(profileId)) {
    query = query.eq("profile_id", profileId);
  } else if (profileId) {
    return local.filter((assignment) => assignment.profileId === profileId);
  }

  const { data, error } = await query;
  if (error || !data) {
    if (!profileId) return local;
    return local.filter((assignment) => assignment.profileId === profileId);
  }

  const remote = (data as DbProfileSiteAssignment[]).map(mapDbToLocal);
  if (profileId) {
    const merged = [
      ...local.filter((assignment) => assignment.profileId !== profileId),
      ...remote
    ];
    writeAssignments(merged);
    return remote;
  }

  const remoteProfiles = new Set(remote.map((assignment) => assignment.profileId));
  const merged = [
    ...local.filter((assignment) => !remoteProfiles.has(assignment.profileId)),
    ...remote
  ];
  writeAssignments(merged);
  return remote;
}

export async function saveProfileSiteAssignments(
  profileId: string,
  siteIds: string[],
  actorUserId?: string
): Promise<SaveProfileSitesResult> {
  const normalizedProfileId = normalizeText(profileId);
  if (!normalizedProfileId) {
    return { siteIds: [], synced: false };
  }

  const normalizedSiteIds = dedupeSiteIds(siteIds);
  const local = readCachedProfileSiteAssignments();
  const companyId = (await resolveCompanyId(actorUserId ?? profileId)) ?? "demo-company";

  const nextAssignments = [
    ...local.filter((assignment) => assignment.profileId !== normalizedProfileId),
    ...normalizedSiteIds.map((siteId) => ({
      id: generateLocalAssignmentId(),
      companyId,
      profileId: normalizedProfileId,
      siteId,
      createdAt: new Date().toISOString()
    }))
  ];
  writeAssignments(nextAssignments);

  if (!supabase || !isUuid(normalizedProfileId)) {
    return { siteIds: normalizedSiteIds, synced: false };
  }

  const resolvedCompanyId = await resolveCompanyId(actorUserId ?? profileId);
  if (!resolvedCompanyId) {
    return { siteIds: normalizedSiteIds, synced: false };
  }

  const { data: existing, error: existingError } = await supabase
    .from("profile_sites")
    .select("id, site_id")
    .eq("company_id", resolvedCompanyId)
    .eq("profile_id", normalizedProfileId);

  if (existingError) {
    return { siteIds: normalizedSiteIds, synced: false };
  }

  const existingRows = (existing ?? []) as Array<{ id: string; site_id: string }>;
  const existingSiteIds = new Set(existingRows.map((row) => row.site_id));
  const desiredRemoteSiteIds = normalizedSiteIds.filter((siteId) => isUuid(siteId));
  const desiredRemoteSet = new Set(desiredRemoteSiteIds);

  const removeIds = existingRows
    .filter((row) => !desiredRemoteSet.has(row.site_id))
    .map((row) => row.id);
  const addSiteIds = desiredRemoteSiteIds.filter((siteId) => !existingSiteIds.has(siteId));

  let removeError: string | null = null;
  if (removeIds.length > 0) {
    const { error } = await supabase.from("profile_sites").delete().in("id", removeIds);
    if (error) removeError = error.message;
  }

  let addError: string | null = null;
  if (addSiteIds.length > 0) {
    const payload = addSiteIds.map((siteId) => ({
      company_id: resolvedCompanyId,
      profile_id: normalizedProfileId,
      site_id: siteId
    }));
    const { error } = await supabase.from("profile_sites").insert(payload);
    if (error) addError = error.message;
  }

  const synced =
    !removeError &&
    !addError &&
    desiredRemoteSiteIds.length === normalizedSiteIds.length;

  if (synced) {
    await loadProfileSiteAssignments(normalizedProfileId, actorUserId);
  }

  return {
    siteIds: normalizedSiteIds,
    synced
  };
}
