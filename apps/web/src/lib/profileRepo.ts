import { supabase } from "./supabase";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const companyIdCache = new Map<string, string | null>();
export const DUPLICATE_EMAIL_ERROR = "E-mail já cadastrado.";

export function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

export async function resolveCompanyId(
  userId: string | null | undefined,
  companyIdOverride?: string | null
): Promise<string | null> {
  if (isUuid(companyIdOverride)) return companyIdOverride;
  if (!supabase) return null;
  if (!isUuid(userId)) return null;
  if (companyIdCache.has(userId)) {
    return companyIdCache.get(userId) ?? null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;

  const companyId = typeof data?.company_id === "string" ? data.company_id : null;
  companyIdCache.set(userId, companyId);
  return companyId;
}

export function clearProfileRepoCache() {
  companyIdCache.clear();
}

export type ProfilePreferences = {
  notificationsEnabled: boolean;
  themePreference: "light" | "dark";
};

export async function fetchProfilePreferences(
  userId: string | null | undefined
): Promise<ProfilePreferences | null> {
  if (!supabase) return null;
  if (!isUuid(userId)) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("notifications_enabled, theme_preference")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const notificationsEnabled =
    typeof data.notifications_enabled === "boolean" ? data.notifications_enabled : true;
  const themePreference = data.theme_preference === "dark" ? "dark" : "light";
  return { notificationsEnabled, themePreference };
}

export async function updateProfilePreferences(
  userId: string | null | undefined,
  prefs: ProfilePreferences
): Promise<boolean> {
  if (!supabase) return false;
  if (!isUuid(userId)) return false;

  const { error } = await supabase
    .from("profiles")
    .update({
      notifications_enabled: prefs.notificationsEnabled,
      theme_preference: prefs.themePreference
    })
    .eq("id", userId);

  return !error;
}

export async function updateProfileAvatar(
  userId: string | null | undefined,
  avatarPath: string | null
): Promise<boolean> {
  if (!supabase) return false;
  if (!isUuid(userId)) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarPath })
    .eq("id", userId);

  return !error;
}

export async function isProfileEmailTaken(
  userId: string | null | undefined,
  email: string
): Promise<boolean> {
  if (!supabase) return false;
  if (!isUuid(userId)) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .neq("id", userId)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export async function updateProfileIdentity(
  userId: string | null | undefined,
  input: { name: string; email: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: true };
  if (!isUuid(userId)) return { ok: false, error: "Usuario invalido." };

  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!name || !email) {
    return { ok: false, error: "Nome e e-mail sao obrigatorios." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name,
      email
    })
    .eq("id", userId);

  if (error) {
    const message = typeof error.message === "string" ? error.message : "Erro ao atualizar perfil.";
    const code = typeof error.code === "string" ? error.code : "";
    if (code === "23505" || /duplicate|unique|already exists|ja cadastrado|já cadastrado/i.test(message)) {
      return { ok: false, error: DUPLICATE_EMAIL_ERROR };
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}
