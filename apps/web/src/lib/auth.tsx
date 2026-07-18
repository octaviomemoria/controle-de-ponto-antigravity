import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { User } from "@supabase/supabase-js";
import { defaultRole, isRole, Role } from "./roles";
import { fetchProfilePreferences } from "./profileRepo";
import {
  applyThemePreference,
  getProfileStorageKey,
  mergeProfilePreferences
} from "./profileStorage";
import { removeKey, readString, writeString } from "./storage";
import { demoModeEnabled, supabase } from "./supabase";

const DEMO_ROLE_KEY = "portal.demo.role";
const AUTH_MODE_KEY = "portal.auth.mode";

type AuthUser = {
  id: string;
  email?: string | null;
  role: Role;
  mode: "supabase" | "demo";
  mustChangePassword?: boolean;
};

type AuthStatus = "loading" | "signed_out" | "signed_in";
type StoredAuthMode = "demo" | "supabase";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  supabaseEnabled: boolean;
  demoModeEnabled: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{
    ok: boolean;
    error?: string;
    needsPasswordChange?: boolean;
  }>;
  signInDemo: (role: Role) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function roleFromSupabaseUser(user: User): Role {
  // Authorization claims must never come from user_metadata: users can edit it.
  const raw = (user.app_metadata as Record<string, unknown> | undefined)?.role;

  if (isRole(raw)) return raw;
  return defaultRole;
}

async function resolveAuthoritativeRole(user: User): Promise<Role> {
  if (!supabase) return roleFromSupabaseUser(user);

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && data && isRole(data.role)) return data.role;
  return roleFromSupabaseUser(user);
}

function roleFromStorage(): Role | null {
  const raw = readString(DEMO_ROLE_KEY);
  if (raw && isRole(raw)) return raw;
  return null;
}

function readStoredAuthMode(): StoredAuthMode | null {
  const raw = readString(AUTH_MODE_KEY);
  if (raw === "demo" || raw === "supabase") return raw;
  return null;
}

function writeStoredAuthMode(mode: StoredAuthMode) {
  writeString(AUTH_MODE_KEY, mode);
}

function clearStoredAuthMode() {
  removeKey(AUTH_MODE_KEY);
}

function makeDemoUser(role: Role): AuthUser {
  return {
    id: "demo",
    email: "demo@local",
    role,
    mode: "demo"
  };
}

function makeSupabaseUser(sessionUser: User): AuthUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    role: roleFromSupabaseUser(sessionUser),
    mode: "supabase",
    mustChangePassword: Boolean(
      (sessionUser.user_metadata as Record<string, unknown> | undefined)?.must_change_password
    )
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const supabaseEnabled = Boolean(supabase);

  useEffect(() => {
    if (!supabaseEnabled) {
      if (!demoModeEnabled) {
        removeKey(DEMO_ROLE_KEY);
        clearStoredAuthMode();
        setUser(null);
        setStatus("signed_out");
        return;
      }
      const role = roleFromStorage();
      if (role) {
        setUser(makeDemoUser(role));
        setStatus("signed_in");
      } else {
        setUser(null);
        setStatus("signed_out");
      }
      return;
    }

    if (!demoModeEnabled && readStoredAuthMode() === "demo") {
      removeKey(DEMO_ROLE_KEY);
      clearStoredAuthMode();
    }

    let active = true;
    const applySupabaseSession = async (sessionUser: User) => {
      const role = await resolveAuthoritativeRole(sessionUser);
      if (!active || isDemoSessionLocked()) return;
      writeStoredAuthMode("supabase");
      setUser({ ...makeSupabaseUser(sessionUser), role });
      setStatus("signed_in");
    };
    const restoreDemoSession = () => {
      if (!demoModeEnabled) return false;
      if (readStoredAuthMode() !== "demo") return false;
      const role = roleFromStorage();
      if (!role) return false;
      setUser(makeDemoUser(role));
      setStatus("signed_in");
      return true;
    };
    restoreDemoSession();

    const isDemoSessionLocked = () => {
      return demoModeEnabled && readStoredAuthMode() === "demo" && Boolean(roleFromStorage());
    };

    supabase!.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (isDemoSessionLocked()) {
        restoreDemoSession();
        return;
      }
      const sessionUser = data.session?.user ?? null;
      if (!sessionUser) {
        setUser(null);
        setStatus("signed_out");
        return;
      }
      void applySupabaseSession(sessionUser);
    });

    const { data } = supabase!.auth.onAuthStateChange((_event, session) => {
      if (isDemoSessionLocked()) {
        restoreDemoSession();
        return;
      }
      const sessionUser = session?.user ?? null;
      if (!sessionUser) {
        setUser(null);
        setStatus("signed_out");
        return;
      }
      void applySupabaseSession(sessionUser);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [demoModeEnabled, supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled || user?.mode !== "supabase" || !user?.id) return;
    let active = true;
    void fetchProfilePreferences(user.id).then((prefs) => {
      if (!active || !prefs) return;
      mergeProfilePreferences(getProfileStorageKey(user.id), user.email, {
        notificationsEnabled: prefs.notificationsEnabled,
        darkTheme: prefs.themePreference === "dark"
      });
      applyThemePreference(prefs.themePreference === "dark");
    });
    return () => {
      active = false;
    };
  }, [supabaseEnabled, user?.email, user?.id, user?.mode]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabaseEnabled) {
        return {
          ok: false,
          error: "Supabase nao configurado para login."
        };
      }

      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      const needsPasswordChange = Boolean(
        (data?.user?.user_metadata as Record<string, unknown> | undefined)?.must_change_password
      );

      removeKey(DEMO_ROLE_KEY);
      writeStoredAuthMode("supabase");
      return { ok: true, needsPasswordChange };
    },
    [supabaseEnabled]
  );

  const signInDemo = useCallback((role: Role) => {
    if (!demoModeEnabled) return;
    writeString(DEMO_ROLE_KEY, role);
    writeStoredAuthMode("demo");
    if (supabaseEnabled) {
      void supabase!.auth.signOut();
    }
    setUser(makeDemoUser(role));
    setStatus("signed_in");
  }, [demoModeEnabled, supabaseEnabled]);

  const signOut = useCallback(async () => {
    removeKey(DEMO_ROLE_KEY);
    clearStoredAuthMode();
    if (supabaseEnabled) {
      await supabase!.auth.signOut().catch(() => undefined);
    }
    setUser(null);
    setStatus("signed_out");
  }, [supabaseEnabled]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      supabaseEnabled,
      demoModeEnabled,
      signInWithPassword,
      signInDemo,
      signOut
    }),
    [status, user, supabaseEnabled, demoModeEnabled, signInWithPassword, signInDemo, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth deve ser usado dentro de <AuthProvider />");
  }
  return value;
}
