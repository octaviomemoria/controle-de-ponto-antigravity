import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function RequireAuth({ children }: { children: ReactElement }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="glass-card mx-auto mt-20 max-w-lg p-6 text-slate-200">
        Carregando...
      </div>
    );
  }

  if (status === "signed_out") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (user?.mustChangePassword && location.pathname !== "/definir-senha") {
    return (
      <Navigate to="/definir-senha" replace state={{ from: location.pathname, forced: true }} />
    );
  }

  return children;
}
