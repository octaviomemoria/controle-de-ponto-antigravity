import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/roles";
import { isSuperAdminRole, roleLabel } from "../lib/roles";

const demoUsers: Array<{ label: string; role: Role }> = [
  { label: "Colaborador", role: "EMPLOYEE" },
  { label: "Lider", role: "LEADER" },
  { label: "Gestor", role: "MANAGER" },
  { label: "Proprietario", role: "OWNER" },
  { label: "Super Admin", role: "SUPER_ADMIN" }
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { demoModeEnabled, supabaseEnabled, signInDemo, signInWithPassword } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPassword(email.trim(), password);
      if (!result.ok) {
        setError(result.error ?? "Falha ao entrar.");
        return;
      }
      if (result.needsPasswordChange) {
        navigate("/definir-senha", { state: { from: "/login", forced: true } });
        return;
      }
      navigate("/home");
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin(role: Role) {
    signInDemo(role);
    if (isSuperAdminRole(role)) {
      navigate("/super-admin");
      return;
    }
    navigate("/home");
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-center bg-background-light px-6 py-8 text-text-main dark:bg-background-dark">
      <div className="flex flex-col items-center justify-center gap-6 mb-8 animate-pop-in">
        <div className="h-28 w-28 rounded-[2rem] p-1 bg-white dark:bg-slate-800 shadow-md">
          <div
            className="w-full h-full rounded-[1.75rem] bg-center bg-no-repeat bg-cover"
            style={{
              backgroundImage:
                'url("https://images.unsplash.com/photo-1549923746-c502d488b3ea?q=80&w=300&auto=format&fit=crop")'
            }}
          />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-slate-900 dark:text-white tracking-tight text-[32px] font-bold leading-tight">
            Portal do Colaborador
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base font-medium">
            Faça login para continuar.
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-6 w-full" onSubmit={handleLogin} data-testid="login-form">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 ml-1">
            Endereço de Email
          </label>
          <div className="group flex items-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all duration-200 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center text-slate-400 dark:text-slate-500 border-r border-transparent group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">mail</span>
            </div>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="login-email-input"
              className="h-14 w-full border-none bg-transparent p-0 px-2 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0"
              placeholder="voce@empresa.com"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 ml-1">
            Senha
          </label>
          <div className="group flex items-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all duration-200 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center text-slate-400 dark:text-slate-500 border-r border-transparent group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">lock</span>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="login-password-input"
              className="h-14 w-full border-none bg-transparent p-0 px-2 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0"
              placeholder="Digite sua senha"
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
        </div>

        <div className="flex items-center justify-between mt-1 px-1">
          <label className="flex items-center gap-3 cursor-pointer group select-none">
            <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out bg-slate-200 dark:bg-slate-700 has-[:checked]:bg-primary">
              <input type="checkbox" className="peer sr-only" />
              <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5 shadow-sm"></span>
            </div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
              Lembrar-me
            </span>
          </label>
          <button
            type="button"
            onClick={() => navigate("/esqueci-senha")}
            data-testid="login-forgot-password"
            className="text-sm font-bold text-primary hover:text-blue-600 transition-colors outline-none focus:text-blue-600"
          >
            Esqueceu a senha?
          </button>
        </div>

        <button
          disabled={loading || !supabaseEnabled}
          data-testid="login-submit-button"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-white text-lg font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            "Entrar"
          )}
        </button>

        {!supabaseEnabled && !demoModeEnabled && (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
            Supabase ainda não configurado. Defina `VITE_ENABLE_DEMO_MODE=true` apenas em ambiente controlado para usar a demo local.
          </div>
        )}

        {demoModeEnabled && (
          <div className="text-center text-xs text-slate-400 mt-2">
            <span className="block mb-1">Acesso rápido (Demo):</span>
            <div className="grid grid-cols-2 gap-2 text-left w-full max-w-xs mx-auto">
              {demoUsers.map((item, index) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => handleDemoLogin(item.role)}
                  data-testid={`login-demo-${item.role.toLowerCase()}`}
                  className="text-left cursor-pointer hover:text-primary underline hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded transition-colors"
                >
                  {index + 1}. {roleLabel[item.role]}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600" data-testid="login-error">
            {error}
          </div>
        )}
      </form>

      <div className="mt-auto pt-10 text-center space-y-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Precisa de ajuda?{" "}
          <button className="font-semibold text-primary hover:underline transition-colors">
            Contate o Suporte
          </button>
        </p>
        <div className="text-xs text-slate-300 dark:text-slate-600 font-medium">
          v3.0.1 • Role-Based Access
        </div>
      </div>
    </div>
  );
}
