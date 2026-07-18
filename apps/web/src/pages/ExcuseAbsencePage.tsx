import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { appendAuditLog } from "../lib/audit";
import { appendAbsenceJustification } from "../lib/absenceRepo";
import { useAuth } from "../lib/auth";
import { getEmployeeById, loadEmployees } from "../lib/employees";
import { isDateInClosedPeriod } from "../lib/periodLock";
import { appendTimeEntry } from "../lib/timeEntriesRepo";

export default function ExcuseAbsencePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();
  const [employeeId, setEmployeeId] = useState(id ?? "");
  const [employee, setEmployee] = useState(() => (id ? getEmployeeById(id) : undefined));

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reasonCategory, setReasonCategory] = useState("Banco de Horas");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const selectedDateLocked = (() => {
    const selected = new Date(`${date}T00:00:00`);
    if (Number.isNaN(selected.getTime())) return false;
    return isDateInClosedPeriod(selected);
  })();

  useEffect(() => {
    if (!id) return;
    let active = true;
    setEmployeeId(id);
    setEmployee(getEmployeeById(id));
    void loadEmployees().then(() => {
      if (!active) return;
      setEmployee(getEmployeeById(id));
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (!employee) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background-light px-6 text-center text-slate-500 dark:bg-background-dark">
        <span className="material-symbols-outlined text-4xl mb-2">person_off</span>
        <p>Colaborador nao encontrado.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
        >
          Voltar
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedDescription = description.trim().replace(/\s+/g, " ");
    if (normalizedDescription.length < 8) {
      setFormError("Informe uma justificativa mais completa (minimo 8 caracteres).");
      return;
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate.getTime() > today.getTime()) {
      setFormError("A data do abono deve ser hoje ou uma data passada.");
      return;
    }
    if (selectedDateLocked) {
      setFormError("Periodo fechado. Nao e possivel registrar abono nesta data.");
      return;
    }

    setIsSubmitting(true);

    const absenceRecord = await appendAbsenceJustification({
      id: `abs-${Date.now()}`,
      employeeId: employeeId,
      date,
      reason: reasonCategory,
      description: normalizedDescription,
      createdBy: user?.id,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });

    const timelineEntry = await appendTimeEntry({
      id: `abs-entry-${absenceRecord.id}`,
      userId: employeeId,
      type: "ABSENCE",
      timestamp: new Date().toISOString(),
      startDate: date,
      endDate: date,
      location: "Gestao Interna",
      status: "PENDING",
      description: `ABONO PENDENTE: ${reasonCategory} - ${normalizedDescription}`.trim(),
      source: "WEB"
    });

    appendAuditLog({
      actorId: user?.id,
      action: "absence_submitted_for_approval",
      entityType: "absence_justification",
      entityId: absenceRecord.id,
      payload: {
        employeeId: employee.id,
        date,
        reasonCategory,
        timelineEntryId: timelineEntry.id
      }
    });

    setTimeout(() => {
      setIsSubmitting(false);
      navigate(-1);
    }, 800);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <div className="flex items-center px-4 py-3 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-900 dark:text-white">arrow_back</span>
        </button>
        <h1 className="ml-2 text-lg font-bold text-slate-900 dark:text-white">Abonar Falta</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
          <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden">
            <img src={employee.avatar} className="w-full h-full object-cover" alt="User" />
          </div>
          <div>
            <p className="text-xs text-amber-800 dark:text-amber-200 font-bold uppercase">Colaborador</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{employee.name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 flex-1">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Data da Ausencia</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setFormError(null);
                setDate(e.target.value);
              }}
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Motivo do Abono</label>
            <div className="relative">
              <select
                value={reasonCategory}
                onChange={(e) => {
                  setFormError(null);
                  setReasonCategory(e.target.value);
                }}
                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none appearance-none"
              >
                <option>Banco de Horas</option>
                <option>Folga Combinada</option>
                <option>Problema Tecnico</option>
                <option>Esquecimento de Registro</option>
                <option>Dispensado</option>
                <option>Outros</option>
              </select>
              <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                expand_more
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Justificativa / Observacao
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setFormError(null);
                setDescription(e.target.value);
              }}
              rows={4}
              placeholder="Descreva o motivo do abono..."
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none resize-none"
              required
            ></textarea>
          </div>

          {selectedDateLocked && (
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              Data em periodo fechado.
            </p>
          )}

          {formError && (
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{formError}</p>
          )}

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={isSubmitting || selectedDateLocked}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70"
            >
              {isSubmitting ? (
                <span>Processando...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined">check</span>
                  <span>Enviar para Aprovacao</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
