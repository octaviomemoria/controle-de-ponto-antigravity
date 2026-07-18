import { Link } from "react-router-dom";

interface TopBarProps {
  title: string;
}

export default function TopBar({ title }: TopBarProps) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <p className="section-title">Portal do Colaborador</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          {title}
        </h1>
      </div>
      <Link
        to="/perfil"
        className="glass-card flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-100"
      >
        <span className="h-9 w-9 rounded-full bg-gradient-to-br from-aqua-400 to-indigo-500" />
        <span className="hidden sm:block">Meu Perfil</span>
      </Link>
    </header>
  );
}
