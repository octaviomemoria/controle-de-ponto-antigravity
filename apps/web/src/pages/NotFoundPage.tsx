import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 mb-4">
        <span className="material-symbols-outlined text-3xl">search_off</span>
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">404</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Pagina nao encontrada</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        Este endereco nao existe no portal.
      </p>
      <Link
        to="/home"
        className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-600 transition-colors"
      >
        Voltar ao inicio
      </Link>
    </div>
  );
}
