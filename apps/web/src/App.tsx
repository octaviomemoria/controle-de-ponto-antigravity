import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";

// ── Eager pages (needed before/during auth) ───────────────────────────────────
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import NotFoundPage from "./pages/NotFoundPage";

// ── Standard employee pages (loaded eagerly — tiny bundle impact) ─────────────
import EmployeeHomePage from "./pages/EmployeeHomePage";
import PunchPage from "./pages/PunchPage";
import SuccessPage from "./pages/SuccessPage";
import ProfilePage from "./pages/ProfilePage";

// ── Lazy pages (admin/manager/leader routes) ──────────────────────────────────
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const CertificatesPage = lazy(() => import("./pages/CertificatesPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const EmployeeDetailsPage = lazy(() => import("./pages/EmployeeDetailsPage"));
const AddEmployeePage = lazy(() => import("./pages/AddEmployeePage"));
const CompanySettingsPage = lazy(() => import("./pages/CompanySettingsPage"));
const CertificateHistoryPage = lazy(() => import("./pages/CertificateHistoryPage"));
const ExcuseAbsencePage = lazy(() => import("./pages/ExcuseAbsencePage"));
const TimeAdjustmentPage = lazy(() => import("./pages/TimeAdjustmentPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const ManagementPage = lazy(() => import("./pages/ManagementPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const SuperAdminDashboardPage = lazy(() => import("./pages/SuperAdminDashboardPage"));

// ── Shared loading fallback ───────────────────────────────────────────────────
function PageSpinner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        background: "var(--color-bg, #0f172a)"
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#6366f1", animation: "spin 1s linear infinite" }}>
        progress_activity
      </span>
    </div>
  );
}


export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/definir-senha" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/home" element={<EmployeeHomePage />} />
        <Route path="/notificacoes" element={<NotificationsPage />} />
        <Route path="/ponto" element={<PunchPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/historico" element={<HistoryPage />} />
        <Route path="/atestados" element={<CertificatesPage />} />
        <Route
          path="/colaboradores/novo"
          element={
            <RequireRole allowed={["MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <AddEmployeePage />
            </RequireRole>
          }
        />
        <Route
          path="/colaboradores/:id"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <EmployeeDetailsPage />
            </RequireRole>
          }
        />
        <Route
          path="/colaboradores/:id/atestados"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <CertificateHistoryPage />
            </RequireRole>
          }
        />
        <Route
          path="/colaboradores/:id/abono"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <ExcuseAbsencePage />
            </RequireRole>
          }
        />
        <Route
          path="/colaboradores/:id/ajuste-ponto"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <TimeAdjustmentPage />
            </RequireRole>
          }
        />
        <Route
          path="/equipe"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <TeamPage />
            </RequireRole>
          }
        />
        <Route
          path="/gestao"
          element={
            <RequireRole allowed={["MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <ManagementPage />
            </RequireRole>
          }
        />
        <Route
          path="/configuracoes-empresa"
          element={
            <RequireRole allowed={["MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <CompanySettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/auditoria"
          element={
            <RequireRole allowed={["MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <AuditLogsPage />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireRole allowed={["LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"]}>
              <DashboardPage />
            </RequireRole>
          }
        />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/acesso-negado" element={<AccessDeniedPage />} />
      </Route>
      <Route
        path="/super-admin"
        element={
          <RequireAuth>
            <RequireRole allowed={["OWNER", "SUPER_ADMIN"]}>
              <SuperAdminDashboardPage />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/app" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
