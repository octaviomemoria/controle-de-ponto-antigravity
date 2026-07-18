import { createClient } from "@supabase/supabase-js";

type MaybeViteEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_ENABLE_DEMO_MODE?: string;
};

function readEnv(): MaybeViteEnv {
  // Works with Vite (injects import.meta.env) and with other bundlers/builds.
  const viteEnv = (import.meta as unknown as { env?: MaybeViteEnv }).env;
  const windowEnv = (globalThis as unknown as { __APP_ENV__?: MaybeViteEnv }).__APP_ENV__;

  return {
    VITE_SUPABASE_URL: windowEnv?.VITE_SUPABASE_URL ?? viteEnv?.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY:
      windowEnv?.VITE_SUPABASE_ANON_KEY ?? viteEnv?.VITE_SUPABASE_ANON_KEY,
    VITE_ENABLE_DEMO_MODE:
      windowEnv?.VITE_ENABLE_DEMO_MODE ?? viteEnv?.VITE_ENABLE_DEMO_MODE
  };
}

const {
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
  VITE_ENABLE_DEMO_MODE: enableDemoModeRaw
} = readEnv();

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return (
    trimmed === "https://seu-projeto.supabase.co" ||
    trimmed === "sua-chave-anon"
  );
}

const safeSupabaseUrl = isPlaceholder(supabaseUrl) ? "" : supabaseUrl;
const safeSupabaseAnonKey = isPlaceholder(supabaseAnonKey) ? "" : supabaseAnonKey;

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

if (!safeSupabaseUrl || !safeSupabaseAnonKey) {
  console.warn("Supabase env vars ausentes. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
}

function isProductionEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname !== "localhost" && !hostname.includes("dev") && !hostname.includes("staging");
}

const isProduction = isProductionEnvironment();

function computeDemoModeEnabled(): boolean {
  if (!parseBooleanEnv(enableDemoModeRaw)) return false;
  if (isProduction) {
    console.warn("Demo mode disabled in production environment");
    return false;
  }
  return true;
}

export const demoModeEnabled = computeDemoModeEnabled();

export const supabase = safeSupabaseUrl && safeSupabaseAnonKey
  ? createClient(safeSupabaseUrl, safeSupabaseAnonKey)
  : null;
