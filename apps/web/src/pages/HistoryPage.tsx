import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { resolveCompanyInfoForUser } from "../lib/companiesRepo";
import { loadTimeEntries, readCachedTimeEntries } from "../lib/timeEntriesRepo";
import { intervalTypeLabel } from "../lib/workSchedulesRepo";

type HistoryEntry = {
  id: string;
  userId?: string;
  type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "CERTIFICATE" | "ABSENCE";
  timestamp: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  photoUrl?: string;
  source?: string;
  correctedEntryId?: string;
  correctionReason?: string;
  description?: string;
  intervalType?: "LUNCH" | "DINNER" | "SNACK_AM" | "SNACK_PM";
  scheduleViolation?: boolean;
  scheduleNote?: string;
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const state = location.state as { userId?: string; userName?: string } | null;
  const targetUserId = state?.userId;
  const targetUserName = state?.userName;
  const effectiveUserId = targetUserId ?? user?.id;
  const pageTitle = targetUserName ? `Historico de ${targetUserName}` : "Meu Historico";

  const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
  const [companyInfo, setCompanyInfo] = useState<{ name: string | null; logoUrl?: string | null } | null>(null);

  useEffect(() => {
    const applyVisibilityFilter = (entries: HistoryEntry[]) => {
      if (effectiveUserId) {
        return entries.filter((entry) => !entry.userId || entry.userId === effectiveUserId);
      }
      return entries;
    };

    const refreshFromCache = () => {
      const cached = readCachedTimeEntries() as HistoryEntry[];
      setAllHistory(applyVisibilityFilter(cached));
    };

    let active = true;
    const refresh = async () => {
      refreshFromCache();
      await loadTimeEntries({ userId: effectiveUserId });
      if (!active) return;
      refreshFromCache();
    };

    const handleFocus = () => {
      void refresh();
    };

    refreshFromCache();
    void refresh();
    window.addEventListener("storage", refreshFromCache);
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.removeEventListener("storage", refreshFromCache);
      window.removeEventListener("focus", handleFocus);
    };
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId) return;
    let active = true;
    void resolveCompanyInfoForUser(effectiveUserId).then((info) => {
      if (!active) return;
      setCompanyInfo(info);
    });
    return () => {
      active = false;
    };
  }, [effectiveUserId]);

  const filters = useMemo(() => {
    const months = new Set<string>();
    allHistory.forEach((entry) => {
      const date = new Date(entry.timestamp);
      months.add(date.toLocaleString("pt-BR", { month: "long" }));
    });
    const monthArray = Array.from(months);
    const capitalizedMonths = monthArray.map(
      (m) => m.charAt(0).toUpperCase() + m.slice(1)
    );
    return ["Todas", ...capitalizedMonths];
  }, [allHistory]);

  const [activeFilter, setActiveFilter] = useState("Todas");

  const filteredHistory = useMemo(() => {
    if (activeFilter === "Todas") return allHistory;
    return allHistory.filter((entry) => {
      const date = new Date(entry.timestamp);
      const month = date.toLocaleString("pt-BR", { month: "long" });
      return month.toLowerCase() === activeFilter.toLowerCase();
    });
  }, [allHistory, activeFilter]);

  const summaryData = useMemo(() => {
    if (filteredHistory.length === 0) return { hours: "0h 0m", range: "Sem dados" };

    const chronological = [...filteredHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let totalMs = 0;
    let workStartTime: number | null = null;

    chronological.forEach((entry) => {
      const time = new Date(entry.timestamp).getTime();
      if (entry.type === "CLOCK_IN" || entry.type === "BREAK_END") {
        workStartTime = time;
      } else if (entry.type === "CLOCK_OUT" || entry.type === "BREAK_START") {
        if (workStartTime !== null) {
          totalMs += time - workStartTime;
          workStartTime = null;
        }
      }
    });

    const totalMinutes = Math.floor(totalMs / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    const formatDate = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    const firstDate = new Date(chronological[0].timestamp);
    const lastDate = new Date(chronological[chronological.length - 1].timestamp);
    const isToday = (d: Date) => {
      const now = new Date();
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    };
    const rangeLabel = `${formatDate(firstDate)} - ${
      isToday(lastDate) ? "Presente" : formatDate(lastDate)
    }`;

    return {
      hours: `${h}h ${m}m`,
      range: rangeLabel
    };
  }, [filteredHistory]);

  const getStatusConfig = (entry: HistoryEntry) => {
    if (entry.source === "MANUAL_ADJUSTMENT" || entry.correctionReason) {
      return {
        icon: "edit_calendar",
        label: "Ajuste Manual",
        badgeClass: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
      };
    }

    switch (entry.type) {
      case "CLOCK_IN":
        return {
          icon: "login",
          label: "Entrada",
          badgeClass: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        };
      case "CLOCK_OUT":
        return {
          icon: "logout",
          label: "Saida",
          badgeClass: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        };
      case "BREAK_START": {
        const startIntervalLabel = entry.intervalType
          ? intervalTypeLabel(entry.intervalType, true)
          : "Intervalo";
        return {
          icon: "pause_circle",
          label: `Inicio ${startIntervalLabel}`,
          badgeClass: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        };
      }
      case "BREAK_END": {
        const endIntervalLabel = entry.intervalType
          ? intervalTypeLabel(entry.intervalType, true)
          : "Intervalo";
        return {
          icon: "play_circle",
          label: `Fim ${endIntervalLabel}`,
          badgeClass: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        };
      }
      case "CERTIFICATE":
        return {
          icon: "medical_services",
          label: "Atestado",
          badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        };
      case "ABSENCE":
        return {
          icon: "event_busy",
          label: "Abono",
          badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        };
      default:
        return {
          icon: "schedule",
          label: "Desconhecido",
          badgeClass: "bg-slate-100 text-slate-700"
        };
    }
  };

  if (!effectiveUserId) return null;

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark pb-24" data-testid="history-page">
      <header className="sticky top-0 z-20 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 justify-between border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center">
          {pageTitle}
        </h2>
        <button
          onClick={() => navigate("/home")}
          className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">home</span>
        </button>
      </header>

      <div className="sticky top-[60px] z-10 bg-background-light dark:bg-background-dark pt-2 pb-2">
        <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar pb-2">
          {filters.map((month) => (
            <button
              key={month}
              onClick={() => setActiveFilter(month)}
              data-testid={`history-month-filter-${month.toLowerCase().replace(/\s+/g, "-")}`}
              className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full px-5 transition-all duration-200 active:scale-95 ${
                activeFilter === month
                  ? "bg-primary shadow-md shadow-primary/25 text-white font-bold border border-transparent"
                  : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <p className="text-sm whitespace-nowrap">{month}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="flex flex-col w-full rounded-xl bg-[#e3f2fd] dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 p-6 items-center justify-center gap-1 shadow-sm transition-all duration-300" data-testid="history-total-hours-card">
          <span className="text-primary dark:text-primary-400 text-xs font-bold uppercase tracking-wider">
            Total Horas
          </span>
          <p className="text-slate-900 dark:text-white tracking-tight text-4xl font-extrabold leading-tight animate-pop-in">
            {summaryData.hours}
          </p>
          <div className="flex items-center gap-1 mt-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            <span>{summaryData.range}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 pb-2">
        <h3 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
          Atividade Recente
        </h3>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-8">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((entry) => {
            const { icon, label, badgeClass } = getStatusConfig(entry);
            const timestamp = new Date(entry.timestamp);

            return (
              <div
                key={entry.id}
                className="group relative flex flex-col bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50"
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-slate-200 bg-cover bg-center border border-slate-100 dark:border-slate-700 shrink-0 overflow-hidden">
                      {entry.photoUrl ? (
                        <img src={entry.photoUrl} className="w-full h-full object-cover" alt="Proof" />
                      ) : (
                        <img
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                            user?.email ?? "User"
                          )}`}
                          className="w-full h-full object-cover"
                          alt="User"
                        />
                      )}
                    </div>

                    <div className="flex flex-col">
                      <h4 className="text-slate-900 dark:text-white text-xl font-bold leading-none tracking-tight">
                        {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </h4>
                      <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">
                        {timestamp.toLocaleDateString("pt-BR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${badgeClass}`}>
                    <span className="material-symbols-outlined text-[16px]">{icon}</span>
                    <span className="text-xs font-bold">{label}</span>
                  </div>
                </div>

                {entry.type === "CERTIFICATE" && entry.startDate && entry.endDate && (
                  <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded text-xs font-medium text-blue-800 dark:text-blue-200 flex gap-2 items-center">
                    <span className="material-symbols-outlined text-sm">date_range</span>
                    <span>
                      {new Date(entry.startDate).toLocaleDateString()} ate{" "}
                      {new Date(entry.endDate).toLocaleDateString()}
                    </span>
                  </div>
                )}

                {entry.type === "ABSENCE" && entry.description && (
                  <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 p-2 rounded text-xs font-medium text-amber-800 dark:text-amber-200 flex gap-2 items-center">
                    <span className="material-symbols-outlined text-sm">event_busy</span>
                    <span>{entry.description}</span>
                  </div>
                )}
                {entry.correctionReason && (
                  <div className="mt-2 rounded bg-indigo-50 p-2 text-xs font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-200 flex gap-2 items-center">
                    <span className="material-symbols-outlined text-sm">rule</span>
                    <span>{entry.correctionReason}</span>
                  </div>
                )}
                {entry.scheduleViolation && entry.scheduleNote && (
                  <div className="mt-2 rounded bg-amber-50 p-2 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex gap-2 items-center">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>{entry.scheduleNote}</span>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-700/50 flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    location_on
                  </span>
                  <div className="text-xs font-medium min-w-0">
                    <p className="truncate">
                      {entry.location ?? "Localizacao nao informada"}
                      {entry.correctedEntryId ? ` • Ref: ${entry.correctedEntryId}` : ""}
                    </p>
                    {companyInfo?.name && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                        {companyInfo.logoUrl ? (
                          <img
                            src={companyInfo.logoUrl}
                            alt="Logo da empresa"
                            className="h-4 w-4 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <span className="material-symbols-outlined text-xs">apartment</span>
                        )}
                        <span className="truncate">Empresa: {companyInfo.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400" data-testid="history-empty-state">
            <span className="material-symbols-outlined text-4xl mb-2">history_toggle_off</span>
            <p>Nenhum historico encontrado.</p>
            <button onClick={() => setActiveFilter("Todas")} className="mt-2 text-primary font-bold text-sm">
              Ver Tudo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
