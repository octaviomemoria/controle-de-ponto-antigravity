import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isAdminRole, type Role } from "../lib/roles";

type NavItem = {
  to: string;
  label: string;
  icon: string;
};

function itemsForRole(role: Role, _isDemoMode: boolean) {
  if (isAdminRole(role)) {
    const base: NavItem[] = [
      { to: "/home", label: "Início", icon: "dashboard" },
      { to: "/gestao", label: "Gestão", icon: "settings" },
      { to: "/dashboard", label: "Relatórios", icon: "assessment" },
      { to: "/perfil", label: "Perfil", icon: "person" }
    ];
    return base;
  }

  if (role === "LEADER") {
    const base: NavItem[] = [
      { to: "/home", label: "Início", icon: "dashboard" },
      { to: "/equipe", label: "Equipe", icon: "group" },
      { to: "/dashboard", label: "Relatórios", icon: "assessment" },
      { to: "/perfil", label: "Perfil", icon: "person" }
    ];
    return base;
  }

  const base: NavItem[] = [
    { to: "/home", label: "Início", icon: "dashboard" },
    { to: "/historico", label: "Histórico", icon: "history" },
    { to: "/atestados", label: "Pedidos", icon: "assignment" },
    { to: "/perfil", label: "Perfil", icon: "person" }
  ];
  return base;
}

export default function BottomNav() {
  const { user } = useAuth();
  const items = itemsForRole(user?.role ?? "EMPLOYEE", user?.mode === "demo");

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between px-6 pt-2">
        {items.map((item) => {
          const testIdSuffix =
            item.to.replace(/^\/+/, "").replace(/\//g, "-").replace(/[^a-zA-Z0-9-_]/g, "") || "home";

          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`bottom-nav-link-${testIdSuffix}`}
              className={({ isActive }) =>
                `flex w-16 flex-col items-center justify-center gap-1 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                      isActive
                        ? "bg-primary/10 dark:bg-primary/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[24px] ${
                        isActive ? "filled text-primary" : ""
                      }`}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                  </div>
                  <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
