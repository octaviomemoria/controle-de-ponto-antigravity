import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  clearReadNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  readNotifications,
  refreshOperationalNotifications,
  type NotificationRecord
} from "../lib/notifications";

type Filter = "Todas" | "Nao lidas" | "Criticas";

function formatRelativeDate(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "Agora";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function severityClasses(severity: NotificationRecord["severity"]): string {
  if (severity === "CRITICAL") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200";
  }
  if (severity === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200";
  }
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200";
}

function severityLabel(severity: NotificationRecord["severity"]): string {
  if (severity === "CRITICAL") return "Critica";
  if (severity === "WARNING") return "Alerta";
  return "Info";
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("Todas");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const refreshFromStorage = () => {
      if (!active) return;
      setNotifications(readNotifications(user.id));
    };

    const refresh = () => {
      refreshOperationalNotifications(user.id, user.role);
      refreshFromStorage();
    };

    refresh();
    window.addEventListener("storage", refreshFromStorage);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshFromStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id, user?.role]);

  const filtered = useMemo(() => {
    if (filter === "Todas") return notifications;
    if (filter === "Nao lidas") return notifications.filter((item) => item.status === "UNREAD");
    return notifications.filter((item) => item.severity === "CRITICAL");
  }, [filter, notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === "UNREAD").length,
    [notifications]
  );

  if (!user) return null;

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-background-light/95 p-4 pb-2 backdrop-blur-sm dark:border-slate-800 dark:bg-background-dark/95">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center">
          Notificacoes
        </h2>
        <div className="flex w-10 items-center justify-end">
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["Todas", "Nao lidas", "Criticas"] as Filter[]).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                filter === item
                  ? "bg-primary text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setNotifications(markAllNotificationsAsRead(user.id));
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Marcar tudo como lido
          </button>
          <button
            onClick={() => {
              setNotifications(clearReadNotifications(user.id));
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Limpar lidas
          </button>
        </div>

        <div className="space-y-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border p-4 shadow-sm ${severityClasses(item.severity)}`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{item.title}</p>
                  <p className="mt-1 text-xs opacity-80">{item.message}</p>
                </div>
                <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {severityLabel(item.severity)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold opacity-80">
                  {formatRelativeDate(item.createdAt)}
                </div>
                <div className="flex gap-2">
                  {item.status === "UNREAD" && (
                    <button
                      onClick={() => {
                        setNotifications(markNotificationAsRead(user.id, item.id));
                      }}
                      className="rounded-lg border border-current px-2 py-1 text-[11px] font-bold"
                    >
                      Marcar lida
                    </button>
                  )}
                  {item.linkTo && (
                    <button
                      onClick={() => {
                        const next = markNotificationAsRead(user.id, item.id);
                        setNotifications(next);
                        navigate(item.linkTo!);
                      }}
                      className="rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200"
                    >
                      Abrir
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <span className="material-symbols-outlined mb-2 text-3xl">notifications_none</span>
              <p className="text-sm font-semibold">Sem notificacoes neste filtro.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
