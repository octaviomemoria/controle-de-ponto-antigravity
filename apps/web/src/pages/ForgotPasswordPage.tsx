import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseEnabled = Boolean(supabase);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("Informe um email valido para continuar.");
      return;
    }

    if (!supabaseEnabled) {
      setError("Supabase nao configurado. Contate o administrador.");
      return;
    }

    setIsSending(true);
    try {
      const redirectTo = `${window.location.origin}/#/definir-senha`;
      const { error: resetError } = await supabase!.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo }
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-center bg-background-light px-6 py-8 text-text-main dark:bg-background-dark">
      <div className="flex flex-col items-center justify-center gap-4 mb-6 animate-pop-in">
        <div className="text-center space-y-2">
          <h1 className="text-slate-900 dark:text-white tracking-tight text-[28px] font-bold leading-tight">
            Recuperar senha
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base font-medium">
            Enviaremos um link de uso unico para definir uma nova senha.
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-6 w-full" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 ml-1">
            Endereco de Email
          </label>
          <div className="group flex items-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all duration-200 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center text-slate-400 dark:text-slate-500 border-r border-transparent group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">mail</span>
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-14 w-full border-none bg-transparent p-0 px-2 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0"
              placeholder="voce@empresa.com"
              required
            />
          </div>
        </div>

        <button
          disabled={isSending || !supabaseEnabled}
          className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-white text-lg font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            "Enviar link de recuperacao"
          )}
        </button>

        {sent && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Link enviado. Verifique sua caixa de entrada e o spam.
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
