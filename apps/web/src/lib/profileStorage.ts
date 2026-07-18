export type ProfileForm = {
  fullName: string;
  phone: string;
  email: string;
  notificationsEnabled: boolean;
  darkTheme: boolean;
  avatarUrl: string;
};

const PROFILE_STORAGE_PREFIX = "portal.profile.";

export function getProfileStorageKey(userId?: string): string {
  return `${PROFILE_STORAGE_PREFIX}${userId ?? "anon"}`;
}

export function readThemePreference(): boolean {
  try {
    const raw = localStorage.getItem("theme");
    if (raw === "dark") return true;
    if (raw === "light") return false;
  } catch {
    // noop
  }
  return document.documentElement.classList.contains("dark");
}

export function inferNameFromEmail(email?: string | null): string {
  if (!email) return "";
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function readProfile(storageKey: string, userEmail?: string | null): ProfileForm {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {
        fullName: inferNameFromEmail(userEmail),
        phone: "",
        email: userEmail ?? "",
        notificationsEnabled: true,
        darkTheme: readThemePreference(),
        avatarUrl: ""
      };
    }

    const parsed = JSON.parse(raw) as Partial<ProfileForm>;
    return {
      fullName: typeof parsed.fullName === "string" ? parsed.fullName : inferNameFromEmail(userEmail),
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      email: typeof parsed.email === "string" ? parsed.email : userEmail ?? "",
      notificationsEnabled:
        typeof parsed.notificationsEnabled === "boolean" ? parsed.notificationsEnabled : true,
      darkTheme: typeof parsed.darkTheme === "boolean" ? parsed.darkTheme : readThemePreference(),
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : ""
    };
  } catch {
    return {
      fullName: inferNameFromEmail(userEmail),
      phone: "",
      email: userEmail ?? "",
      notificationsEnabled: true,
      darkTheme: readThemePreference(),
      avatarUrl: ""
    };
  }
}

export function persistProfile(storageKey: string, data: ProfileForm) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

export function mergeProfilePreferences(
  storageKey: string,
  userEmail: string | null | undefined,
  prefs: { notificationsEnabled: boolean; darkTheme: boolean }
): ProfileForm {
  const current = readProfile(storageKey, userEmail);
  const next: ProfileForm = {
    ...current,
    notificationsEnabled: prefs.notificationsEnabled,
    darkTheme: prefs.darkTheme
  };
  persistProfile(storageKey, next);
  return next;
}

export function applyThemePreference(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
}
