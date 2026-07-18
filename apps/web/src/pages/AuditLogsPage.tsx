import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadAuditRecords, readCachedAuditRecords, type AuditRecord } from "../lib/auditRepo";

type SourceFilter = "ALL" | "local" | "remote";

export default function AuditLogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditRecord[]>(() => readCachedAuditRecords());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLogs(readCachedAuditRecords());
      const merged = await loadAuditRecords();
      if (!active) return;
      setLogs(merged);
      setIsLoading(false);
    };

    const refreshCached = () => {
      setLogs(readCachedAuditRecords());
    };

    const handleFocus = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener("storage", refreshCached);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshCached);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const entityOptions = useMemo(() => {
    const unique = new Set<string>();
    logs.forEach((log) => unique.add(log.entityType));
    return ["ALL", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return logs.filter((log) => {
      const matchesSource = sourceFilter === "ALL" || log.source === sourceFilter;
      if (!matchesSource) return false;
      const matchesEntity = entityFilter === "ALL" || log.entityType === entityFilter;
      if (!matchesEntity) return false;

      const createdAtMs = new Date(log.createdAt).getTime();
      if (fromDate && createdAtMs < fromDate.getTime()) return false;
      if (toDate && createdAtMs > toDate.getTime()) return false;

      if (!normalizedSearch) return true;
      const inAction = log.action.toLowerCase().includes(normalizedSearch);
      const inEntity = log.entityType.toLowerCase().includes(normalizedSearch);
      const inActor = (log.actorId ?? "").toLowerCase().includes(normalizedSearch);
      return inAction || inEntity || inActor;
    });
  }, [dateFrom, dateTo, entityFilter, logs, searchTerm, sourceFilter]);

  const recentCount = useMemo(() => {
    const now = Date.now();
    const last24h = 24 * 60 * 60 * 1000;
    return filteredLogs.filter((log) => now - new Date(log.createdAt).getTime() <= last24h).length;
  }, [filteredLogs]);

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

  const handleExportCsv = () => {
    const headers = [
      "created_at",
      "source",
      "action",
      "entity_type",
      "entity_id",
      "actor_id",
      "payload"
    ];
    const rows = filteredLogs.map((log) => {
      const payload = log.payload ? JSON.stringify(log.payload).replace(/"/g, '""') : "";
      return [
        log.createdAt,
        log.source,
        log.action,
        log.entityType,
        log.entityId ?? "",
        log.actorId ?? "",
        `"${payload}"`
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-background-light/95 p-4 pb-2 backdrop-blur-sm dark:border-slate-800 dark:bg-background-dark/95">
        <button
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center text-lg font-bold text-slate-900 dark:text-white">
          Auditoria
        </h2>
        <button
          onClick={handleExportCsv}
          className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Exportar CSV"
        >
          <span className="material-symbols-outlined text-2xl">download</span>
        </button>
      </header>

      <div className="px-4 py-3">
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          {filteredLogs.length} evento(s) • {recentCount} nas ultimas 24h
        </div>

        <div className="relative mb-3">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            search
          </span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Buscar por acao, entidade ou actor id"
          />
        </div>

        <div className="mb-2 flex gap-2">
          {(["ALL", "local", "remote"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setSourceFilter(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                sourceFilter === option
                  ? "bg-primary text-white"
                  : "bg-white text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {option === "ALL" ? "Todos" : option === "local" ? "Local" : "Remoto"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Entidade
            <select
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {entityOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "Todas" : option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-500 dark:text-slate-400">
            De
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>

          <label className="text-xs text-slate-500 dark:text-slate-400">
            Ate
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 pb-6">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{log.action}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{log.entityType}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                      log.source === "remote"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    }`}
                  >
                    {log.source}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>Data: {formatDateTime(log.createdAt)}</p>
                  <p>Actor: {log.actorId ?? "N/A"}</p>
                  <p>Entidade ID: {log.entityId ?? "N/A"}</p>
                </div>

                {log.payload && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <span className="material-symbols-outlined mb-2 text-4xl">history_toggle_off</span>
            <p>Nenhum evento encontrado.</p>
          </div>
        )}
      </main>
    </div>
  );
}
