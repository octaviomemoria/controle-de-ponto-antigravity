import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/roles";

export default function RequireRole({
  allowed,
  children
}: {
  allowed: Role[];
  children: ReactElement;
}) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return children;
}
