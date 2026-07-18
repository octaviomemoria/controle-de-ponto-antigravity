import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import { getEmployeeById, loadEmployees } from "../lib/employees";
import { isDateInClosedPeriod } from "../lib/periodLock";
import {
  appendTimeEntry,
  loadTimeEntries,
  readCachedTimeEntries,
  type TimeEntryRecord,
  type TimeEntryType
} from "../lib/timeEntriesRepo";
import { isLeaderOrAbove } from "../lib/roles";

type PunchType = Extract<TimeEntryType, "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END">;

const PUNCH_TYPES: PunchType[] = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"];

const REASON_CATEGORIES = [
  "Esquecimento de registro",
  "Falha de aplicativo",
  "Falha de dispositivo",
  "Erro operacional",
  "Ajuste autorizado pelo gestor"
];

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function punchTypeLabel(type: PunchType): string {
  switch (type) {
    case "CLOCK_IN":
      return "Entrada";
    case "CLOCK_OUT":
      return "Saida";
    case "BREAK_START":
      return "Inicio intervalo";
    case "BREAK_END":
      return "Fim intervalo";
    default:
      return "Registro";
  }
}

function sortByTimestampDesc(entries: TimeEntryRecord[]): TimeEntryRecord[] {
  return [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export default function TimeAdjustmentPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState(id ?? "");
  const [employeeName, setEmployeeName] = useState<string>("");
  const [entries, setEntries] = useState<TimeEntryRecord[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [adjustType, setAdjustType] = useState<PunchType>("CLOCK_IN");
  const [adjustDate, setAdjustDate] = useState(() => formatDateInput(new Date()));
  const [adjustTime, setAdjustTime] = useState(() => formatTimeInput(new Date()));
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reasonDetails, setReasonDetails] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = isLeaderOrAbove(user?.role);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const refreshEmployee = () => {
      const employee = getEmployeeById(id);
      setEmployeeId(id);
      setEmployeeName(employee?.name ?? "Colaborador");
    };
    refreshEmployee();
    void loadEmployees().then(() => {
      if (!active) return;
      refreshEmployee();
    });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;

    const refreshFromCache = () => {
      const cached = readCachedTimeEntries().filter((entry) => {
        if (entry.userId !== employeeId) return false;
        return PUNCH_TYPES.includes(entry.type as PunchType);
      });
      const ordered = sortByTimestampDesc(cached);
      setEntries(ordered);
      setSelectedEntryId((current) => {
        if (current && ordered.some((entry) => entry.id === current)) return current;
        return ordered[0]?.id ?? "";
      });
    };

    const refresh = async () => {
      refreshFromCache();
      await loadTimeEntries({ userId: employeeId });
      if (!active) return;
      refreshFromCache();
    };

    refreshFromCache();
    void refresh();

    window.addEventListener("storage", refreshFromCache);
    window.addEventListener("focus", refreshFromCache);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshFromCache);
      window.removeEventListener("focus", refreshFromCache);
    };
  }, [employeeId]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId),
    [entries, selectedEntryId]
  );

  useEffect(() => {
    if (!selectedEntry) return;
    if (!PUNCH_TYPES.includes(selectedEntry.type as PunchType)) return;
    const selectedDate = new Date(selectedEntry.timestamp);
    if (Number.isNaN(selectedDate.getTime())) return;
    setAdjustType(selectedEntry.type as PunchType);
    setAdjustDate(formatDateInput(selectedDate));
    setAdjustTime(formatTimeInput(selectedDate));
  }, [selectedEntry?.id]);

  const selectedDateLocked = (() => {
    const selected = new Date(`${adjustDate}T00:00:00`);
    if (Number.isNaN(selected.getTime())) return false;
    return isDateInClosedPeriod(selected);
  })();

  if (!canManage) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFeedback(null);

    if (!user) {
      setFormError("Usuario nao autenticado.");
      return;
    }
    if (!employeeId) {
      setFormError("Colaborador nao selecionado.");
      return;
    }
    if (!selectedEntryId) {
      setFormError("Selecione o registro original a ser ajustado.");
      return;
    }
    if (selectedDateLocked) {
      setFormError("Periodo fechado. Nao e possivel registrar ajuste nessa data.");
      return;
    }

    const normalizedReason = reasonDetails.trim().replace(/\s+/g, " ");
    if (normalizedReason.length < 8) {
      setFormError("Informe uma justificativa valida (minimo 8 caracteres).");
      return;
    }

    const timestamp = new Date(`${adjustDate}T${adjustTime}:00`);
    if (Number.isNaN(timestamp.getTime())) {
      setFormError("Data/hora invalida para ajuste.");
      return;
    }
    if (timestamp.getTime() > Date.now() + 60_000) {
      setFormError("Ajustes nao podem usar data/hora futura.");
      return;
    }

    setIsSubmitting(true);
    const correctionReason = `${reasonCategory}: ${normalizedReason}`;
    const persistedEntry = await appendTimeEntry({
      id: `adj-${Date.now()}`,
      userId: employeeId,
      type: adjustType,
      timestamp: timestamp.toISOString(),
      location: "Ajuste manual (gestao)",
      status: navigator.onLine ? "SYNCED" : "PENDING",
      source: "MANUAL_ADJUSTMENT",
      correctedEntryId: selectedEntryId,
      correctionReason,
      description: `AJUSTE: ${correctionReason}`
    });

    appendAuditLog({
      actorId: user.id,
      action: "time_entry_adjusted",
      entityType: "time_entry",
      entityId: persistedEntry.id,
      payload: {
        employeeId,
        correctedEntryId: selectedEntryId,
        adjustmentType: adjustType,
        adjustedTimestamp: persistedEntry.timestamp,
        correctionReason,
        offline: !navigator.onLine
      }
    });

    setFeedback("Ajuste registrado e enviado para trilha de auditoria.");
    setIsSubmitting(false);
    setTimeout(() => {
      navigate(-1);
    }, 700);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark">
      <header className="sticky top-0 z-20 flex items-center border-b border-slate-200 bg-background-light/95 p-4 pb-2 backdrop-blur-sm dark:border-slate-800 dark:bg-background-dark/95">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-10">
          Ajustar Ponto
        </h2>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-4">
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Colaborador
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{employeeName}</p>
        </div>

        {formError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {formError}
          </div>
        )}
        {feedback && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Registro Original
            </p>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {entries.slice(0, 20).map((entry) => {
                const selected = entry.id === selectedEntryId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setSelectedEntryId(entry.id);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selected
                        ? "border-primary bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-700"
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {punchTypeLabel(entry.type as PunchType)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(entry.timestamp).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </button>
                );
              })}
              {entries.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Nenhum registro de ponto encontrado para ajuste.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Novo Registro
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tipo</span>
                <select
                  value={adjustType}
                  onChange={(event) => {
                    setFormError(null);
                    setAdjustType(event.target.value as PunchType);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {PUNCH_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {punchTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Data</span>
                <input
                  type="date"
                  value={adjustDate}
                  onChange={(event) => {
                    setFormError(null);
                    setAdjustDate(event.target.value);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Hora</span>
                <input
                  type="time"
                  value={adjustTime}
                  onChange={(event) => {
                    setFormError(null);
                    setAdjustTime(event.target.value);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
            </div>
            {selectedDateLocked && (
              <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                Data em periodo fechado.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Justificativa
            </p>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Categoria</span>
              <select
                value={reasonCategory}
                onChange={(event) => {
                  setFormError(null);
                  setReasonCategory(event.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {REASON_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Detalhes</span>
              <textarea
                value={reasonDetails}
                onChange={(event) => {
                  setFormError(null);
                  setReasonDetails(event.target.value);
                }}
                rows={4}
                placeholder="Descreva o motivo do ajuste..."
                className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
          </section>

          <button
            type="submit"
            disabled={isSubmitting || entries.length === 0 || selectedDateLocked}
            className="w-full rounded-xl bg-primary px-4 py-4 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Registrando ajuste..." : "Registrar Ajuste"}
          </button>
        </form>
      </main>
    </div>
  );
}
