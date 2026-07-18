import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { syncPendingAuditLogs } from "../lib/audit";
import { useAuth } from "../lib/auth";
import { syncPendingAbsenceJustifications } from "../lib/absenceRepo";
import {
  loadCertificates,
  readCachedCertificates,
  syncPendingCertificates
} from "../lib/certificatesRepo";
import {
  emitBrowserNotifications,
  getUnreadNotificationsCount,
  readProfileNotificationsEnabled,
  refreshOperationalNotifications
} from "../lib/notifications";
import { loadTimeEntries, syncPendingTimeEntries } from "../lib/timeEntriesRepo";

type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

type PunchEntry = {
  id: string;
  type: PunchType | "CERTIFICATE" | "ABSENCE";
  timestamp: string;
  status?: "PENDING" | "SYNCED";
};

const ENTRIES_KEY = "portal.time_entries";
const LAST_PUNCH_KEY = "portal.lastPunch";
const WORK_HOURS_KEY = "portal.company.workHours";

function readEntries(): PunchEntry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PunchEntry[];
  } catch {
    return [];
  }
}

function readLastPunch(): { type: PunchType; timestamp: string } | null {
  try {
    const raw = localStorage.getItem(LAST_PUNCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { type: PunchType; timestamp: string };
  } catch {
    return null;
  }
}

function readWorkHours(): number {
  try {
    const raw = localStorage.getItem(WORK_HOURS_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) {
      return parsed;
    }
    return 8;
  } catch {
    return 8;
  }
}

function formatDurationFromMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, totalMinutes);
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function EmployeeHomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [nextAction, setNextAction] = useState<"CLOCK_IN" | "CLOCK_OUT">(
    "CLOCK_IN"
  );
  const [lastPunch, setLastPunch] = useState(readLastPunch());
  const [workHours, setWorkHours] = useState(readWorkHours());
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [certificateSummary, setCertificateSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  useEffect(() => {
    if (!user) return;
    let active = true;

    const refreshNotifications = () => {
      const current = refreshOperationalNotifications(user.id, user.role);
      if (!active) return;
      setUnreadNotifications(getUnreadNotificationsCount(user.id));
      const notificationsEnabled = readProfileNotificationsEnabled(user.id);
      void emitBrowserNotifications(user.id, current, notificationsEnabled);
    };

    refreshNotifications();
    const timer = setInterval(refreshNotifications, 30000);
    window.addEventListener("storage", refreshNotifications);
    window.addEventListener("focus", refreshNotifications);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("storage", refreshNotifications);
      window.removeEventListener("focus", refreshNotifications);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const refresh = () => {
      const list = readCachedCertificates(user.id);
      if (!active) return;
      const pending = list.filter((item) => item.status === "PENDING").length;
      const approved = list.filter((item) => item.status === "APPROVED").length;
      const rejected = list.filter((item) => item.status === "REJECTED").length;
      setCertificateSummary({
        total: list.length,
        pending,
        approved,
        rejected
      });
    };

    refresh();
    void loadCertificates(user.id).then(refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    const handleStatusChange = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        setSyncing(true);
        void Promise.all([
          syncPendingTimeEntries(user?.id),
          syncPendingCertificates(user?.id),
          syncPendingAbsenceJustifications(user?.id),
          syncPendingAuditLogs(user?.id)
        ]).finally(() => {
          if (user) {
            refreshOperationalNotifications(user.id, user.role);
            setUnreadNotifications(getUnreadNotificationsCount(user.id));
          }
          setTimeout(() => setSyncing(false), 700);
        });
      }
    };

    handleStatusChange();
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    const refreshLocalState = () => {
      const last = readLastPunch();
      setLastPunch(last);
      setWorkHours(readWorkHours());
      if (last && (last.type === "CLOCK_IN" || last.type === "BREAK_END")) {
        setNextAction("CLOCK_OUT");
        return;
      }
      setNextAction("CLOCK_IN");
    };

    const refreshWithRemote = () => {
      refreshLocalState();
      void loadTimeEntries({ userId: user?.id }).then(refreshLocalState);
    };

    const handleFocus = () => refreshWithRemote();

    refreshWithRemote();
    const refreshTimer = setInterval(refreshLocalState, 5000);
    window.addEventListener("storage", refreshLocalState);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(refreshTimer);
      window.removeEventListener("storage", refreshLocalState);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user?.id]);

  const todaySummary = useMemo(() => {
    const nowMs = currentTime.getTime();
    const entries = readEntries()
      .filter((entry) => {
        const date = new Date(entry.timestamp);
        return (
          date.getDate() === currentTime.getDate() &&
          date.getMonth() === currentTime.getMonth() &&
          date.getFullYear() === currentTime.getFullYear()
        );
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalMs = 0;
    let currentStart: number | null = null;
    entries.forEach((entry) => {
      const time = new Date(entry.timestamp).getTime();
      if (entry.type === "CLOCK_IN" || entry.type === "BREAK_END") {
        currentStart = time;
      } else if (entry.type === "CLOCK_OUT" || entry.type === "BREAK_START") {
        if (currentStart !== null) {
          totalMs += time - currentStart;
          currentStart = null;
        }
      }
    });

    if (currentStart !== null) {
      totalMs += Math.max(0, nowMs - currentStart);
    }

    const totalMinutes = Math.floor(totalMs / 60000);
    return formatDurationFromMinutes(totalMinutes);
  }, [currentTime]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("pt-BR", {
      weekday: "long",
      month: "short",
      day: "numeric"
    });

  const getStatusDisplay = () => {
    if (!isOnline) {
      return {
        label: "Offline",
        icon: "wifi_off",
        containerClass:
          "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700",
        textClass: "text-amber-700 dark:text-amber-400",
        iconClass: "text-amber-600 dark:text-amber-400"
      };
    }
    if (syncing) {
      return {
        label: "Sincronizando...",
        icon: "sync",
        containerClass:
          "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700",
        textClass: "text-blue-700 dark:text-blue-400",
        iconClass: "text-blue-600 dark:text-blue-400 animate-spin"
      };
    }
    return {
      label: "Online",
      icon: "wifi",
      containerClass:
        "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-700",
      textClass: "text-green-700 dark:text-green-400",
      iconClass: "text-green-600 dark:text-green-400"
    };
  };

  const status = getStatusDisplay();
  const lastPunchTime = lastPunch ? new Date(lastPunch.timestamp) : null;

  return (
    <div className="flex flex-col min-h-screen pb-10 relative select-none">
      <div className="sticky top-0 z-20 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md transition-colors duration-300">
        <div className="flex items-center p-4 pb-2 justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative shrink-0">
              <div
                className="bg-center bg-no-repeat bg-cover rounded-full size-10 border-2 border-white dark:border-slate-700 shadow-sm"
                style={{
                  backgroundImage: `url("https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user?.email ?? "User"
                  )}&background=137fec&color=fff")`
                }}
              />
              <div
                className={`absolute bottom-0 right-0 size-3 border-2 border-white dark:border-background-dark rounded-full ${
                  isOnline ? "bg-green-500" : "bg-amber-500"
                }`}
              ></div>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-none mb-0.5">
                Bem-vindo,
              </span>
              <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-none tracking-tight">
                {user?.email ?? "Colaborador"}
              </h2>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => navigate("/notificacoes")}
              className="relative flex items-center justify-center rounded-full size-10 bg-white dark:bg-slate-800 text-slate-500 hover:text-primary hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Notificacoes"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
                notifications
              </span>
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex items-center justify-center rounded-full size-10 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Sair"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
                logout
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 mt-2 mb-6">
        <div
          className={`inline-flex h-8 items-center justify-center gap-x-2 rounded-full pl-3 pr-4 shadow-sm border transition-all duration-300 ${status.containerClass}`}
        >
          <span
            className={`material-symbols-outlined text-[18px] ${status.iconClass}`}
          >
            {status.icon}
          </span>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${status.textClass}`}
          >
            {status.label}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center pt-4 pb-8">
        <h1 className="text-slate-900 dark:text-white text-[56px] font-extrabold leading-none tracking-tight font-display tabular-nums">
          {formatTime(currentTime)}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg font-medium mt-2 capitalize">
          {formatDate(currentTime)}
        </p>
      </div>

      <div className="flex justify-center items-center py-6 relative">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full animate-pulse pointer-events-none ${
            isOnline
              ? nextAction === "CLOCK_IN"
                ? "bg-primary/10"
                : "bg-orange-500/10"
              : "bg-slate-300/10"
          }`}
        ></div>
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none ${
            isOnline
              ? nextAction === "CLOCK_IN"
                ? "bg-primary/20"
                : "bg-orange-500/20"
              : "bg-slate-300/20"
          }`}
        ></div>

        <button
          onClick={() => navigate("/ponto")}
          disabled={!isOnline}
          className={`group relative flex flex-col items-center justify-center w-40 h-40 rounded-full text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] active:scale-95 active:shadow-inner transition-all duration-200 z-10 ${
            !isOnline
              ? "bg-slate-400 cursor-not-allowed shadow-slate-500/20"
              : nextAction === "CLOCK_IN"
                ? "bg-gradient-to-b from-primary to-[#0f6bd0] shadow-blue-500/20"
                : "bg-gradient-to-b from-orange-400 to-orange-600 shadow-orange-500/20"
          }`}
        >
          <span className="material-symbols-outlined text-[42px] mb-1 group-active:scale-90 transition-transform">
            {isOnline ? (nextAction === "CLOCK_IN" ? "login" : "logout") : "wifi_off"}
          </span>
          <span className="text-xs font-extrabold tracking-widest uppercase mt-1 opacity-90">
            {isOnline ? "REGISTRAR" : "OFFLINE"}
          </span>
          <span className="text-sm font-extrabold tracking-widest uppercase leading-none">
            {isOnline
              ? nextAction === "CLOCK_IN"
                ? "ENTRADA"
                : "SAIDA"
              : "INDISPONIVEL"}
          </span>
        </button>
      </div>

      <div className="px-4 mt-6">
        <button
          onClick={() => navigate("/atestados")}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500">
              <span className="material-symbols-outlined">medical_services</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Atestados
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Envie e acompanhe o status
              </p>
              {certificateSummary.total > 0 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Pendentes: {certificateSummary.pending} • Aprovados: {certificateSummary.approved} •
                  Rejeitados: {certificateSummary.rejected}
                </p>
              )}
            </div>
          </div>
          <span className="material-symbols-outlined text-slate-400">chevron_right</span>
        </button>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-4xl text-primary">login</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            Ultimo ponto
          </div>
          <p className="text-[11px] font-semibold text-slate-400">Last Punch</p>
          <div>
            <div className="text-slate-900 dark:text-white text-2xl font-bold tabular-nums">
              {lastPunchTime ? formatTime(lastPunchTime) : "--:--"}
            </div>
            <div className="text-slate-400 dark:text-slate-500 text-xs mt-1">
              {lastPunch ? "Registrado" : "Sem registros"}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-4xl text-orange-500">schedule</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            Hoje
          </div>
          <p className="text-[11px] font-semibold text-slate-400">Total Hours • Overtime</p>
          <div>
            <div className="text-slate-900 dark:text-white text-2xl font-bold tabular-nums">
              {todaySummary}
            </div>
            <div className="text-slate-400 dark:text-slate-500 text-xs mt-1">
              Meta: {formatDurationFromMinutes(Math.round(workHours * 60))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
