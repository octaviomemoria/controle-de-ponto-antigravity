import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

type AuthTokens = {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
};

function extractAuthTokens(hash: string): AuthTokens {
  const cleaned = hash.startsWith("#") ? hash.slice(1) : hash;
  const tokenIndex = cleaned.indexOf("access_token=");
  if (tokenIndex === -1) return {};
  const params = new URLSearchParams(cleaned.slice(tokenIndex));
  return {
    accessToken: params.get("access_token") ?? undefined,
    refreshToken: params.get("refresh_token") ?? undefined,
    type: params.get("type") ?? undefined
  };
}

function clearAuthTokensFromHash() {
  const hash = window.location.hash;
  const tokenIndex = hash.indexOf("#access_token=");
  if (tokenIndex === -1) return;
  const cleanHash = hash.slice(0, tokenIndex);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${cleanHash}`
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const supabaseEnabled = Boolean(supabase);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const forcedChange = useMemo(() => {
    const state = location.state as { forced?: boolean } | null;
    return Boolean(state?.forced);
  }, [location.state]);

  useEffect(() => {
    if (!supabaseEnabled) {
      setError("Supabase nao configurado. Contate o administrador.");
      setReady(true);
      return;
    }

    let active = true;
    const tokens = extractAuthTokens(window.location.hash);

    const ensureSession = async () => {
      if (tokens.accessToken && tokens.refreshToken) {
        const { error: sessionError } = await supabase!.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken
        });
        if (!active) return;
        if (sessionError) {
          setError("Link invalido ou expirado. Solicite um novo email.");
          setReady(true);
          return;
        }
        clearAuthTokensFromHash();
        setReady(true);
        return;
      }

      const { data } = await supabase!.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setError("Link invalido ou expirado. Solicite um novo email.");
      }
      setReady(true);
    };

    void ensureSession();
    return () => {
      active = false;
    };
  }, [supabaseEnabled]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!supabaseEnabled) {
      setError("Supabase nao configurado.");
      return;
    }

    if (!ready) {
      setError("Aguarde a validacao do link.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase!.auth.updateUser({
        password,
        data: { must_change_password: false }
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      await supabase!.auth.signOut();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-center bg-background-light px-6 py-8 text-text-main dark:bg-background-dark">
      <div className="flex flex-col items-center justify-center gap-4 mb-6 animate-pop-in">
        <div className="text-center space-y-2">
          <h1 className="text-slate-900 dark:text-white tracking-tight text-[28px] font-bold leading-tight">
            Definir nova senha
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base font-medium">
            {forcedChange
              ? "Sua senha temporaria precisa ser atualizada para continuar."
              : "Crie uma nova senha para acessar sua conta."}
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-6 w-full" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 ml-1">
            Nova senha
          </label>
          <div className="group flex items-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all duration-200 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center text-slate-400 dark:text-slate-500 border-r border-transparent group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">lock</span>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-14 w-full border-none bg-transparent p-0 px-2 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0"
              placeholder="Digite sua nova senha"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="flex h-14 w-14 items-center justify-center text-slate-400 hover:text-primary transition-colors cursor-pointer focus:outline-none"
            >
              <span className="material-symbols-outlined">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <p className="text-xs text-slate-400">Minimo de {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 ml-1">
            Confirmar senha
          </label>
          <div className="group flex items-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all duration-200 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center text-slate-400 dark:text-slate-500 border-r border-transparent group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">lock_clock</span>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-14 w-full border-none bg-transparent p-0 px-2 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0"
              placeholder="Repita sua nova senha"
              required
            />
          </div>
        </div>

        <button
          disabled={isSaving || !ready || success}
          className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-white text-lg font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : success ? (
            "Senha atualizada"
          ) : (
            "Salvar nova senha"
          )}
        </button>

        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Senha atualizada. Faça login novamente para continuar.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        {!supabaseEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Recuperacao de senha indisponivel no modo demo.
          </div>
        )}
      </form>

      <div className="mt-8 text-center space-y-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-semibold text-primary hover:underline transition-colors"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  );
}
