import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "./BottomNav";

export default function AppShell() {
  const location = useLocation();
  const hiddenNavPaths = new Set([
    "/ponto",
    "/success",
    "/configuracoes-empresa",
    "/colaboradores/novo",
    "/acesso-negado"
  ]);
  const hideNav =
    hiddenNavPaths.has(location.pathname) || location.pathname.startsWith("/colaboradores/");

  const shellPadding = hideNav ? "pb-0" : "pb-24";
  const wideLayoutPaths = new Set(["/dashboard", "/super-admin"]);
  const isWideLayout = wideLayoutPaths.has(location.pathname);
  const containerWidth = isWideLayout ? "max-w-[1200px]" : "max-w-md";

  return (
    <div className="min-h-[100dvh] bg-background-light dark:bg-background-dark">
      <div className={`mx-auto min-h-[100dvh] w-full ${containerWidth} ${shellPadding}`}>
        <Outlet />
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
