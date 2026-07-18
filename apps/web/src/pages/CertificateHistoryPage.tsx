import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  formatSlaRemainingLabel,
  getApprovalSlaState
} from "../lib/approvalSla";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  loadCertificates,
  readCachedCertificates,
  updateCertificateStatus,
  type CertificateRecord
} from "../lib/certificatesRepo";
import { getEmployeeById, loadEmployees } from "../lib/employees";
import { updateTimeEntryStatus } from "../lib/timeEntriesRepo";

type CertificateFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export default function CertificateHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();
  const [employee, setEmployee] = useState(() => (id ? getEmployeeById(id) : undefined));

  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [filter, setFilter] = useState<CertificateFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setEmployee(getEmployeeById(id));
    void loadEmployees().then(() => {
      if (!active) return;
      setEmployee(getEmployeeById(id));
    });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!employee) return;

    let active = true;
    const refreshFromCache = () => {
      setCertificates(readCachedCertificates(employee.id));
    };

    const refresh = async () => {
      setIsLoading(true);
      refreshFromCache();
      const synced = await loadCertificates(employee.id);
      if (!active) return;
      setCertificates(synced);
      setIsLoading(false);
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
  }, [employee?.id]);

  const filteredCerts = useMemo(() => {
    if (filter === "ALL") return certificates;
    return certificates.filter((cert) => cert.status === filter);
  }, [certificates, filter]);

  const pendingStats = useMemo(() => {
    const pending = certificates.filter((cert) => cert.status === "PENDING");
    const overdue = pending.filter(
      (cert) => getApprovalSlaState(cert.slaDueAt) === "OVERDUE"
    );
    return {
      pendingCount: pending.length,
      overdueCount: overdue.length
    };
  }, [certificates]);

  const handleDecision = async (certId: string, status: "APPROVED" | "REJECTED") => {
    setDecisionError(null);
    const actionText = status === "APPROVED" ? "aprovar" : "rejeitar";
    let reviewNote = "";

    if (status === "REJECTED") {
      reviewNote = window.prompt("Motivo da rejeicao (minimo 5 caracteres):", "")?.trim() ?? "";
      if (reviewNote.length < 5) {
        setDecisionError("Informe um motivo valido para rejeicao.");
        return;
      }
    }

    if (!window.confirm(`Confirma ${actionText} este atestado?`)) return;

    await updateCertificateStatus(certId, status, {
      actorId: user?.id,
      reviewNote: reviewNote || undefined
    });
    await updateTimeEntryStatus(
      `cert-${certId}`,
      status === "APPROVED" ? "SYNCED" : "REJECTED"
    );

    if (employee) {
      const refreshed = await loadCertificates(employee.id);
      setCertificates(refreshed);
    }

    appendAuditLog({
      actorId: user?.id,
      action: status === "APPROVED" ? "certificate_approved" : "certificate_rejected",
      entityType: "certificate",
      entityId: certId,
      payload: {
        employeeId: employee?.id,
        reviewNote: reviewNote || undefined
      }
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

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

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <div className="flex items-center px-4 py-3 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-900 dark:text-white">arrow_back</span>
        </button>
        <div className="ml-2 flex-1">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none">
            Historico de Atestados
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{employee.name}</p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        {decisionError && (
          <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {decisionError}
          </div>
        )}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          Pendentes: {pendingStats.pendingCount} • SLA vencido: {pendingStats.overdueCount}
        </div>
      </div>

      <div className="flex p-4 gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 sticky top-[60px] z-10">
        <button
          onClick={() => setFilter("ALL")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            filter === "ALL"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setFilter("PENDING")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            filter === "PENDING"
              ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          Pendentes
        </button>
        <button
          onClick={() => setFilter("APPROVED")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            filter === "APPROVED"
              ? "bg-green-600 text-white shadow-md shadow-green-600/20"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          Aprovados
        </button>
        <button
          onClick={() => setFilter("REJECTED")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            filter === "REJECTED"
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          Rejeitados
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : filteredCerts.length > 0 ? (
          filteredCerts.map((cert) => {
            const slaState = getApprovalSlaState(cert.slaDueAt);
            const slaClass =
              slaState === "OVERDUE"
                ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300"
                : slaState === "DUE_SOON"
                  ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300"
                  : "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300";

            const statusClass =
              cert.status === "PENDING"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : cert.status === "APPROVED"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";

            return (
              <div
                key={cert.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
                      <span className="material-symbols-outlined">medical_services</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Atestado Medico</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(cert.startDate)} - {formatDate(cert.endDate)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${statusClass}`}>
                    {cert.status === "PENDING"
                      ? "Pendente"
                      : cert.status === "APPROVED"
                        ? "Aprovado"
                        : "Rejeitado"}
                  </span>
                </div>

                {cert.status === "PENDING" && (
                  <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${slaClass}`}>
                    {formatSlaRemainingLabel(cert.slaDueAt)}
                  </div>
                )}

                {cert.description && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                    {cert.description}
                  </div>
                )}

                {cert.status !== "PENDING" && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                    <p>Revisado em: {formatDateTime(cert.reviewedAt)}</p>
                    {cert.reviewNote && <p>Observacao: {cert.reviewNote}</p>}
                  </div>
                )}

                <div className="flex gap-3 mt-1">
                  {cert.fileUrl && (
                    <button
                      onClick={() => window.open(cert.fileUrl, "_blank")}
                      className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Ver Comprovante
                    </button>
                  )}

                  {cert.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => void handleDecision(cert.id, "REJECTED")}
                        className="flex-1 py-2.5 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Rejeitar
                      </button>
                      <button
                        onClick={() => void handleDecision(cert.id, "APPROVED")}
                        className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Aprovar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 opacity-70">
            <span className="material-symbols-outlined text-5xl mb-2">folder_off</span>
            <p>Nenhum atestado encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
