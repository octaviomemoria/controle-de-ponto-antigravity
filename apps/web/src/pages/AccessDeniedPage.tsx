import { Link } from "react-router-dom";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 mb-4">
        <span className="material-symbols-outlined text-3xl">lock</span>
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Acesso negado</p>
      <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
        Voce nao tem permissao para esta area
      </h2>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        Se voce acredita que isso e um erro, fale com o administrador da empresa.
      </p>
      <Link
        to="/home"
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-600 transition-colors"
      >
        Voltar ao inicio
      </Link>
    </div>
  );
}
