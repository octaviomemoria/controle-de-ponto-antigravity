export const roles = ["EMPLOYEE", "LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"] as const;

export type Role = (typeof roles)[number];

export const defaultRole: Role = "EMPLOYEE";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

export const roleLabel: Record<Role, string> = {
  EMPLOYEE: "Colaborador",
  LEADER: "Lider",
  MANAGER: "Gestor",
  OWNER: "Proprietario",
  SUPER_ADMIN: "Super Admin"
};

export function canAccessPath(pathname: string, role: Role): boolean {
  const adminRoles: Role[] = ["MANAGER", "OWNER", "SUPER_ADMIN"];
  const leaderRoles: Role[] = ["LEADER", ...adminRoles];
  const access: Record<string, Role[]> = {
    "/home": roles.slice(),
    "/ponto": roles.slice(),
    "/atestados": roles.slice(),
    "/historico": roles.slice(),
    "/success": roles.slice(),
    "/perfil": roles.slice(),
    "/equipe": leaderRoles,
    "/gestao": adminRoles,
    "/dashboard": leaderRoles,
    "/configuracoes-empresa": adminRoles,
    "/super-admin": adminRoles
  };

  const allowed = access[pathname];
  if (!allowed) return true;
  return allowed.includes(role);
}

export const adminRoles: Role[] = ["MANAGER", "OWNER", "SUPER_ADMIN"];
export const leaderRoles: Role[] = ["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"];
export const superAdminRoles: Role[] = ["OWNER", "SUPER_ADMIN"];

export function isAdminRole(role: Role | undefined): boolean {
  return role !== undefined && adminRoles.includes(role);
}

export function isLeaderOrAbove(role: Role | undefined): boolean {
  return role !== undefined && leaderRoles.includes(role);
}

export function isSuperAdminRole(role: Role | undefined): boolean {
  return role !== undefined && superAdminRoles.includes(role);
}
