import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  formatSlaRemainingLabel,
  getApprovalSlaState
} from "../lib/approvalSla";
import {
  loadAbsenceJustifications,
  readCachedAbsenceJustifications,
  updateAbsenceJustificationStatus,
  type AbsenceJustification
} from "../lib/absenceRepo";
import type { MockEmployee } from "../data/mockEmployees";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  loadCertificates,
  readCachedCertificates,
  updateCertificateStatus,
  type CertificateRecord
} from "../lib/certificatesRepo";
import {
  employeeEmailExists,
  getEmployeeById,
  listEmployees,
  loadEmployees,
  updateEmployee
} from "../lib/employees";
import {
  loadCompanySites,
  readCachedCompanySites,
  type CompanySite
} from "../lib/companySitesRepo";
import {
  loadCompanySettings,
  readCachedCompanySettings,
  type CompanySettings
} from "../lib/companySettingsRepo";
import {
  loadProfileSiteAssignments,
  readAssignedSiteIds,
  saveProfileSiteAssignments
} from "../lib/profileSitesRepo";
import {
  intervalTypeLabel,
  loadProfileScheduleId,
  loadWorkSchedules,
  saveProfileScheduleId,
  type WorkSchedule
} from "../lib/workSchedulesRepo";
import {
  loadLeaderAssignments,
  readLeaderAssignment,
  saveLeaderAssignment
} from "../lib/leaderAssignmentsRepo";
import {
  loadTimeEntries,
  readCachedTimeEntries,
  updateTimeEntryStatus
} from "../lib/timeEntriesRepo";
import { isAdminRole, isLeaderOrAbove } from "../lib/roles";

type TimeEntry = {
  id: string;
  userId?: string;
  type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "CERTIFICATE" | "ABSENCE";
  timestamp: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  photoUrl?: string;
  description?: string;
  status?: "PENDING" | "SYNCED" | "REJECTED";
  source?: string;
  correctionReason?: string;
  intervalType?: "LUNCH" | "DINNER" | "SNACK_AM" | "SNACK_PM";
  scheduleViolation?: boolean;
  scheduleNote?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EditEmployeeForm = {
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  active: boolean;
};

export default function EmployeeDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = isLeaderOrAbove(user?.role);
  const canAssignLeader = isAdminRole(user?.role);
  const canConfigureSiteScope = isAdminRole(user?.role);

  const [employee, setEmployee] = useState<MockEmployee | null>(() =>
    id ? getEmployeeById(id) ?? null : null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(employee?.avatar);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [absences, setAbsences] = useState<AbsenceJustification[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [companySites, setCompanySites] = useState<CompanySite[]>(() =>
    readCachedCompanySites().filter((site) => site.isActive)
  );
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() =>
    readCachedCompanySettings()
  );
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(() =>
    id ? readAssignedSiteIds(id) : []
  );
  const [isSavingSiteAssignments, setIsSavingSiteAssignments] = useState(false);
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [leaderOptions, setLeaderOptions] = useState<MockEmployee[]>(() =>
    listEmployees().filter((entry) => entry.role.toLowerCase().includes("lider"))
  );
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>("");
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [editForm, setEditForm] = useState<EditEmployeeForm>({
    name: employee?.name ?? "",
    role: employee?.role ?? "",
    department: employee?.department ?? "Operacoes",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    active: employee?.active ?? true
  });

  useEffect(() => {
    if (!id) {
      setEmployee(null);
      return;
    }
    let active = true;
    const refreshEmployee = () => {
      const latest = getEmployeeById(id) ?? null;
      setEmployee(latest);
      void loadEmployees().then(() => {
        if (!active) return;
        const refreshed = getEmployeeById(id) ?? null;
        setEmployee(refreshed);
      });
    };
    refreshEmployee();
    window.addEventListener("storage", refreshEmployee);
    window.addEventListener("focus", refreshEmployee);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshEmployee);
      window.removeEventListener("focus", refreshEmployee);
    };
  }, [id]);

  useEffect(() => {
    setAvatarUrl(employee?.avatar);
  }, [employee?.avatar]);

  useEffect(() => {
    if (!employee?.id) return;

    let active = true;
    const refreshFromCache = () => {
      const data = readCachedTimeEntries()
        .filter((entry) => entry.userId === employee.id) as TimeEntry[];
      data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEntries(data);
    };

    const refresh = async () => {
      refreshFromCache();
      await loadTimeEntries({ userId: employee.id });
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
  }, [employee?.id]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setCompanySettings(readCachedCompanySettings());
      const remote = await loadCompanySettings(user?.id);
      if (!active) return;
      setCompanySettings(remote);
    };
    void refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!employee?.id) return;

    let active = true;
    const refreshCertificatesFromCache = () => {
      setCertificates(readCachedCertificates(employee.id));
    };
    const refreshAbsencesFromCache = () => {
      setAbsences(readCachedAbsenceJustifications(employee.id));
    };

    const refresh = async () => {
      refreshCertificatesFromCache();
      refreshAbsencesFromCache();
      await Promise.all([
        loadCertificates(employee.id),
        loadAbsenceJustifications(employee.id)
      ]);
      if (!active) return;
      refreshCertificatesFromCache();
      refreshAbsencesFromCache();
    };

    refreshCertificatesFromCache();
    refreshAbsencesFromCache();
    void refresh();
    window.addEventListener("storage", refreshCertificatesFromCache);
    window.addEventListener("storage", refreshAbsencesFromCache);
    window.addEventListener("focus", refreshCertificatesFromCache);
    window.addEventListener("focus", refreshAbsencesFromCache);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshCertificatesFromCache);
      window.removeEventListener("storage", refreshAbsencesFromCache);
      window.removeEventListener("focus", refreshCertificatesFromCache);
      window.removeEventListener("focus", refreshAbsencesFromCache);
    };
  }, [employee?.id]);

  useEffect(() => {
    if (!employee) return;
    setEditForm({
      name: employee.name,
      role: employee.role,
      department: employee.department,
      email: employee.email,
      phone: employee.phone,
      active: employee.active
    });
  }, [employee]);

  useEffect(() => {
    if (!employee?.id) return;
    let active = true;

    const refreshFromCache = () => {
      setCompanySites(readCachedCompanySites().filter((site) => site.isActive));
      setSelectedSiteIds(readAssignedSiteIds(employee.id));
    };

    const refresh = async () => {
      refreshFromCache();
      const [sites, assignments] = await Promise.all([
        loadCompanySites(user?.id),
        loadProfileSiteAssignments(employee.id, user?.id)
      ]);
      if (!active) return;
      setCompanySites(sites.filter((site) => site.isActive));
      setSelectedSiteIds(
        assignments
          .filter((assignment) => assignment.profileId === employee.id)
          .map((assignment) => assignment.siteId)
      );
    };

    refreshFromCache();
    if (canConfigureSiteScope) {
      void refresh();
    }

    window.addEventListener("storage", refreshFromCache);
    window.addEventListener("focus", refreshFromCache);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshFromCache);
      window.removeEventListener("focus", refreshFromCache);
    };
  }, [employee?.id, user?.id, canConfigureSiteScope]);

  useEffect(() => {
    if (!employee?.id) return;
    let active = true;

    const refresh = async () => {
      const schedules = await loadWorkSchedules(user?.id);
      const profileScheduleId = await loadProfileScheduleId(employee.id, user?.id);
      if (!active) return;
      setWorkSchedules(schedules);
      const defaultId = schedules.find((schedule) => schedule.isDefault)?.id ?? schedules[0]?.id ?? "";
      setSelectedScheduleId(profileScheduleId ?? defaultId);
    };

    const handleFocus = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [employee?.id, user?.id]);

  useEffect(() => {
    let active = true;
    const refreshLeaders = async () => {
      const list = await loadEmployees();
      if (!active) return;
      const leaders = list.filter(
        (entry) =>
          entry.role.toLowerCase().includes("lider") &&
          entry.id !== employee?.id
      );
      setLeaderOptions(leaders);
    };

    void refreshLeaders();
    window.addEventListener("storage", refreshLeaders);
    window.addEventListener("focus", refreshLeaders);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshLeaders);
      window.removeEventListener("focus", refreshLeaders);
    };
  }, [employee?.id]);

  useEffect(() => {
    if (!employee?.id) return;
    let active = true;
    const refreshAssignment = async () => {
      await loadLeaderAssignments(user?.id);
      if (!active) return;
      const leaderId = readLeaderAssignment(employee.id);
      setSelectedLeaderId(leaderId ?? "");
    };

    void refreshAssignment();
    window.addEventListener("storage", refreshAssignment);
    window.addEventListener("focus", refreshAssignment);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshAssignment);
      window.removeEventListener("focus", refreshAssignment);
    };
  }, [employee?.id, user?.id]);

  if (!employee) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark text-slate-500">
        <span className="material-symbols-outlined text-4xl mb-2">person_off</span>
        <p>Colaborador nao encontrado</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary font-bold">
          Voltar
        </button>
      </div>
    );
  }

  const pendingCertificates = certificates.filter((entry) => entry.status === "PENDING");
  const pendingAbsences = absences.filter((entry) => entry.status === "PENDING");

  const getStatusColor = (active: boolean) =>
    active
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : "bg-rose-100 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400";

  const handleUploadClick = () => {
    if (isAdminRole(user?.role)) {
      setFormError(null);
      setFeedback(null);
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !employee) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Formato de foto invalido. Envie uma imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Imagem maior que 5MB. Envie um arquivo menor.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const nextAvatar = e.target.result as string;
        const updated = updateEmployee(employee.id, { avatar: nextAvatar });
        if (!updated) {
          setFormError("Nao foi possivel atualizar a foto.");
          return;
        }
        appendAuditLog({
          actorId: user?.id,
          action: "employee_avatar_updated",
          entityType: "employee",
          entityId: employee.id
        });
        setEmployee(updated);
        setAvatarUrl(nextAvatar);
        setFeedback("Foto atualizada com sucesso.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCertificateDecision = async (
    certificateId: string,
    status: "APPROVED" | "REJECTED"
  ) => {
    const actionLabel = status === "APPROVED" ? "aprovar" : "rejeitar";
    let reviewNote = "";

    if (status === "REJECTED") {
      reviewNote = window.prompt("Motivo da rejeicao (minimo 5 caracteres):", "")?.trim() ?? "";
      if (reviewNote.length < 5) {
        setFormError("Informe um motivo valido para rejeicao.");
        return;
      }
    }

    if (!window.confirm(`Confirma ${actionLabel} este atestado?`)) return;

    setFormError(null);
    await updateCertificateStatus(certificateId, status, {
      actorId: user?.id,
      reviewNote: reviewNote || undefined
    });
    await updateTimeEntryStatus(
      `cert-${certificateId}`,
      status === "APPROVED" ? "SYNCED" : "REJECTED"
    );

    const refreshedCertificates = await loadCertificates(employee.id);
    setCertificates(refreshedCertificates);

    const employeeEntries = readCachedTimeEntries()
      .filter((entry) => entry.userId === employee.id) as TimeEntry[];
    employeeEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEntries(employeeEntries);

    appendAuditLog({
      actorId: user?.id,
      action: status === "APPROVED" ? "certificate_approved" : "certificate_rejected",
      entityType: "certificate",
      entityId: certificateId,
      payload: {
        employeeId: employee.id,
        reviewNote: reviewNote || undefined
      }
    });
    setFeedback(status === "APPROVED" ? "Atestado aprovado com sucesso." : "Atestado rejeitado.");
  };

  const handleAbsenceDecision = async (
    absenceId: string,
    status: "APPROVED" | "REJECTED"
  ) => {
    const actionLabel = status === "APPROVED" ? "aprovar" : "rejeitar";
    let reviewNote = "";

    if (status === "REJECTED") {
      reviewNote = window.prompt("Motivo da rejeicao (minimo 5 caracteres):", "")?.trim() ?? "";
      if (reviewNote.length < 5) {
        setFormError("Informe um motivo valido para rejeicao do abono.");
        return;
      }
    }

    if (!window.confirm(`Confirma ${actionLabel} este abono?`)) return;

    setFormError(null);
    const updated = await updateAbsenceJustificationStatus(absenceId, status, {
      actorId: user?.id,
      reviewNote: reviewNote || undefined
    });

    if (!updated) {
      setFormError("Nao foi possivel atualizar o status do abono.");
      return;
    }

    await updateTimeEntryStatus(
      `abs-entry-${absenceId}`,
      status === "APPROVED" ? "SYNCED" : "REJECTED"
    );

    const refreshedAbsences = await loadAbsenceJustifications(employee.id);
    setAbsences(refreshedAbsences);

    const employeeEntries = readCachedTimeEntries()
      .filter((entry) => entry.userId === employee.id) as TimeEntry[];
    employeeEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEntries(employeeEntries);

    appendAuditLog({
      actorId: user?.id,
      action: status === "APPROVED" ? "absence_approved" : "absence_rejected",
      entityType: "absence_justification",
      entityId: absenceId,
      payload: {
        employeeId: employee.id,
        reviewNote: reviewNote || undefined
      }
    });
    setFeedback(status === "APPROVED" ? "Abono aprovado com sucesso." : "Abono rejeitado.");
  };

  const handleSaveEmployee = () => {
    if (!employee) return;
    setFormError(null);
    setFeedback(null);

    const normalizedName = editForm.name.trim().replace(/\s+/g, " ");
    const normalizedRole = editForm.role.trim().replace(/\s+/g, " ");
    const normalizedDepartment = editForm.department.trim().replace(/\s+/g, " ");
    const normalizedEmail = editForm.email.trim().toLowerCase();
    const normalizedPhone = editForm.phone.trim();
    const phoneDigits = normalizedPhone.replace(/\D/g, "");

    if (normalizedName.length < 3) {
      setFormError("Nome invalido.");
      return;
    }
    if (normalizedRole.length < 2) {
      setFormError("Cargo invalido.");
      return;
    }
    if (normalizedDepartment.length < 2) {
      setFormError("Departamento invalido.");
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setFormError("Email invalido.");
      return;
    }
    if (employeeEmailExists(normalizedEmail, employee.id)) {
      setFormError("Ja existe outro colaborador com este email.");
      return;
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      setFormError("Telefone invalido. Use DDD + numero.");
      return;
    }

    const updated = updateEmployee(employee.id, {
      name: normalizedName,
      role: normalizedRole,
      department: normalizedDepartment,
      email: normalizedEmail,
      phone: normalizedPhone,
      active: editForm.active
    });

    if (!updated) {
      setFormError("Nao foi possivel salvar as alteracoes.");
      return;
    }

    appendAuditLog({
      actorId: user?.id,
      action: "employee_updated",
      entityType: "employee",
      entityId: employee.id,
      payload: {
        name: updated.name,
        role: updated.role,
        department: updated.department,
        email: updated.email,
        phone: updated.phone,
        active: updated.active
      }
    });
    setEmployee(updated);
    setIsEditing(false);
    setFeedback("Dados cadastrais atualizados.");
  };

  const toggleSelectedSite = (siteId: string) => {
    if (!canConfigureSiteScope) return;
    setSelectedSiteIds((prev) => {
      if (prev.includes(siteId)) {
        return prev.filter((id) => id !== siteId);
      }
      return [...prev, siteId];
    });
  };

  const handleSaveSiteAssignments = async () => {
    if (!employee?.id || !canConfigureSiteScope) return;
    setFormError(null);
    setFeedback(null);
    setIsSavingSiteAssignments(true);

    const result = await saveProfileSiteAssignments(
      employee.id,
      selectedSiteIds,
      user?.id
    );

    appendAuditLog({
      actorId: user?.id,
      action: "employee_site_scope_updated",
      entityType: "employee",
      entityId: employee.id,
      payload: {
        siteIds: result.siteIds,
        synced: result.synced
      }
    });

    setIsSavingSiteAssignments(false);
    setFeedback(
      result.synced
        ? "Filiais permitidas atualizadas."
        : "Filiais atualizadas localmente. Sincronizacao pendente."
    );
  };

  const handleSaveScheduleAssignment = async () => {
    if (!employee?.id || !canManage || !selectedScheduleId) return;
    setFormError(null);
    setFeedback(null);
    setIsSavingSchedule(true);

    const result = await saveProfileScheduleId(employee.id, selectedScheduleId, user?.id);
    appendAuditLog({
      actorId: user?.id,
      action: "employee_schedule_updated",
      entityType: "work_schedule",
      entityId: selectedScheduleId,
      payload: {
        employeeId: employee.id,
        synced: result.synced
      }
    });

    setIsSavingSchedule(false);
    setFeedback(result.synced ? "Jornada atualizada." : "Jornada atualizada localmente.");
  };

  const handleSaveLeaderAssignment = async () => {
    if (!employee?.id || !canAssignLeader) return;
    if (selectedLeaderId && selectedLeaderId === employee.id) {
      setFormError("O colaborador nao pode ser o proprio lider.");
      return;
    }

    setFormError(null);
    setFeedback(null);
    setIsSavingLeader(true);

    const result = await saveLeaderAssignment(
      employee.id,
      selectedLeaderId || null,
      user?.id
    );

    appendAuditLog({
      actorId: user?.id,
      action: "employee_leader_updated",
      entityType: "leader_assignment",
      entityId: employee.id,
      payload: {
        employeeId: employee.id,
        leaderId: result.leaderId,
        synced: result.synced
      }
    });

    setIsSavingLeader(false);
    setFeedback(result.synced ? "Lider atualizado." : "Lider atualizado localmente.");
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark pb-6">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      <header className="sticky top-0 z-20 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center">
          Detalhes do Colaborador
        </h2>
        {isAdminRole(user?.role) ? (
          <button
            onClick={() => {
              setFormError(null);
              setFeedback(null);
              if (isEditing) {
                setIsEditing(false);
                if (employee) {
                  setEditForm({
                    name: employee.name,
                    role: employee.role,
                    department: employee.department,
                    email: employee.email,
                    phone: employee.phone,
                    active: employee.active
                  });
                }
                return;
              }
              setIsEditing(true);
            }}
            className="text-primary flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isEditing ? "Cancelar edicao" : "Editar colaborador"}
          >
            <span className="material-symbols-outlined text-2xl">
              {isEditing ? "close" : "edit"}
            </span>
          </button>
        ) : (
          <div className="w-10"></div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4">
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
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Employee profile details • Management actions
        </div>
        <div className="flex flex-col items-center p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
          <div className="relative mb-4">
            <div
              className={`bg-center bg-no-repeat bg-cover rounded-full h-32 w-32 ring-4 ring-slate-50 dark:ring-slate-700 shadow-xl ${
                !employee.active ? "grayscale opacity-80" : ""
              }`}
              style={{ backgroundImage: `url("${avatarUrl || employee.avatar}")` }}
            ></div>

            <div
              className={`absolute top-1 right-1 h-6 w-6 rounded-full border-4 border-white dark:border-slate-800 ${
                employee.active ? "bg-green-500" : "bg-rose-500"
              }`}
            ></div>

            {isAdminRole(user?.role) && (
              <button
                onClick={handleUploadClick}
                className="absolute bottom-0 right-0 h-10 w-10 flex items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg hover:bg-primary dark:hover:bg-slate-200 transition-colors z-10 ring-4 ring-white dark:ring-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                title="Alterar Foto"
              >
                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
              </button>
            )}
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{employee.name}</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-3">{employee.role}</p>
          <p className="text-slate-400 text-xs mb-3">{employee.department}</p>

          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(employee.active)}`}>
            {employee.active ? "Ativo" : "Ausente/Ferias"}
          </span>

          <div className="flex gap-4 mt-6 w-full">
            <button
              onClick={() => (window.location.href = `tel:${employee.phone.replace(/\D/g, "")}`)}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">call</span>
              Ligar
            </button>
            <button
              onClick={() => window.open(`https://wa.me/${employee.phone.replace(/\D/g, "")}`, "_blank")}
              className="flex-1 py-3 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-white font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
              Mensagem
            </button>
          </div>
        </div>

        {canManage && (pendingCertificates.length > 0 || pendingAbsences.length > 0) && (
          <div className="mb-6 animate-pop-in">
            <h3 className="text-sm font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">warning</span>
              Aprovacoes Pendentes
            </h3>
            <div className="flex flex-col gap-3">
              {pendingCertificates.map((cert) => {
                const slaState = getApprovalSlaState(cert.slaDueAt);
                const slaClass =
                  slaState === "OVERDUE"
                    ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300"
                    : slaState === "DUE_SOON"
                      ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300"
                      : "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300";

                return (
                  <div
                    key={cert.id}
                    className="bg-white dark:bg-slate-800 rounded-xl p-4 border-l-4 border-rose-500 shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">Atestado Medico</h4>
                        <p className="text-xs text-slate-500">
                          {formatDate(cert.startDate)} ate {formatDate(cert.endDate)}
                        </p>
                      </div>
                      <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold px-2 py-1 rounded">
                        PENDENTE
                      </span>
                    </div>

                    <div className={`mb-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${slaClass}`}>
                      {formatSlaRemainingLabel(cert.slaDueAt)}
                    </div>

                    {cert.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-700/50 p-2 rounded">
                        "{cert.description}"
                      </p>
                    )}

                    <div className="flex gap-2">
                      {cert.fileUrl && (
                        <button
                          onClick={() => window.open(cert.fileUrl, "_blank")}
                          className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold"
                        >
                          Ver Anexo
                        </button>
                      )}
                      <button
                        onClick={() => void handleCertificateDecision(cert.id, "REJECTED")}
                        className="flex-1 py-2 rounded-lg bg-rose-500 text-white text-xs font-bold shadow-sm"
                      >
                        Rejeitar
                      </button>
                      <button
                        onClick={() => void handleCertificateDecision(cert.id, "APPROVED")}
                        className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold shadow-sm"
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                );
              })}

              {pendingAbsences.map((absence) => {
                const slaState = getApprovalSlaState(absence.slaDueAt);
                const slaClass =
                  slaState === "OVERDUE"
                    ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300"
                    : slaState === "DUE_SOON"
                      ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300"
                      : "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300";

                return (
                  <div
                    key={absence.id}
                    className="bg-white dark:bg-slate-800 rounded-xl p-4 border-l-4 border-amber-500 shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          Abono de Falta
                        </h4>
                        <p className="text-xs text-slate-500">
                          {formatDate(absence.date)} • {absence.reason}
                        </p>
                      </div>
                      <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold px-2 py-1 rounded">
                        PENDENTE
                      </span>
                    </div>

                    <div className={`mb-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${slaClass}`}>
                      {formatSlaRemainingLabel(absence.slaDueAt)}
                    </div>

                    {absence.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-700/50 p-2 rounded">
                        "{absence.description}"
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleAbsenceDecision(absence.id, "REJECTED")}
                        className="flex-1 py-2 rounded-lg bg-rose-500 text-white text-xs font-bold shadow-sm"
                      >
                        Rejeitar
                      </button>
                      <button
                        onClick={() => void handleAbsenceDecision(absence.id, "APPROVED")}
                        className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold shadow-sm"
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canConfigureSiteScope && (
          <div className="mb-6">
            <div className="mb-3 px-1">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Acoes de Gestao
              </h3>
              <p className="text-[11px] font-semibold text-slate-400">Management actions</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate(`/colaboradores/${employee.id}/abono`)}
                className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl flex flex-col items-center gap-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">event_busy</span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Abonar Falta</span>
              </button>
              <button
                onClick={() => navigate(`/colaboradores/${employee.id}/atestados`)}
                className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl flex flex-col items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">folder_shared</span>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">Historico Atestados</span>
              </button>
              <button
                onClick={() => navigate(`/colaboradores/${employee.id}/ajuste-ponto`)}
                className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl flex flex-col items-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">schedule</span>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Ajustar Ponto</span>
              </button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
              Acesso por Filial
            </h3>
            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina em quais filiais este colaborador pode registrar ponto.
              </p>
              {companySettings.siteAccessPolicy === "ASSIGNED_ONLY" && selectedSiteIds.length === 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Este colaborador nao possui filiais atribuídas. O registro de ponto ficara bloqueado.
                </div>
              )}

              {companySites.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                  Nenhuma filial ativa encontrada. Cadastre ou ative filiais em Configuracoes da Empresa.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {companySites.map((site) => {
                    const checked = selectedSiteIds.includes(site.id);
                    return (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => toggleSelectedSite(site.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                          checked
                            ? "border-primary bg-blue-50 text-primary dark:bg-blue-900/20"
                            : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        <span>
                          <span className="font-semibold">{site.name}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {site.city || "Cidade nao informada"} • {site.timezone}
                          </span>
                        </span>
                        <span className="material-symbols-outlined text-base">
                          {checked ? "check_circle" : "radio_button_unchecked"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSiteIds(companySites.map((site) => site.id))}
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSiteIds([])}
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveSiteAssignments()}
                  disabled={isSavingSiteAssignments || companySites.length === 0}
                  className="rounded-xl bg-primary px-2 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-70"
                >
                  {isSavingSiteAssignments ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {canAssignLeader && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
              Lider Responsavel
            </h3>
            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina o lider direto deste colaborador.
              </p>
              {leaderOptions.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                  Nenhum lider cadastrado. Crie um usuario com papel de Lider.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                    Lider
                    <select
                      value={selectedLeaderId}
                      onChange={(event) => setSelectedLeaderId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">Sem lider definido</option>
                      {leaderOptions.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.name} • {leader.department}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSaveLeaderAssignment()}
                    disabled={isSavingLeader}
                    className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-70"
                  >
                    {isSavingLeader ? "Salvando..." : "Salvar lider"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {canManage && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
              Jornada de Trabalho
            </h3>
            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina a jornada e os intervalos do colaborador.
              </p>
              {workSchedules.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                  Nenhuma jornada cadastrada. Configure em Configuracoes da Empresa.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                    Jornada
                    <select
                      value={selectedScheduleId}
                      onChange={(event) => setSelectedScheduleId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {workSchedules.map((schedule) => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.name}{schedule.isDefault ? " (Padrao)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedScheduleId && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Turno: {workSchedules.find((s) => s.id === selectedScheduleId)?.shiftStart} -{" "}
                      {workSchedules.find((s) => s.id === selectedScheduleId)?.shiftEnd} •
                      Tolerancia{" "}
                      {workSchedules.find((s) => s.id === selectedScheduleId)?.defaultToleranceMin ?? 0}min
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveScheduleAssignment()}
                    disabled={isSavingSchedule || !selectedScheduleId}
                    className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-70"
                  >
                    {isSavingSchedule ? "Salvando..." : "Salvar Jornada"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-3 px-1">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Dados Pessoais
          </h3>
          <p className="text-[11px] font-semibold text-slate-400">Employee profile details</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden mb-6">
          {isEditing && canManage ? (
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Nome</span>
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Cargo</span>
                <input
                  value={editForm.role}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Departamento</span>
                <input
                  value={editForm.department}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, department: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Email</span>
                <input
                  value={editForm.email}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Telefone</span>
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Status</span>
                <select
                  value={editForm.active ? "active" : "inactive"}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      active: event.target.value === "active"
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Ausente/Ferias</option>
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormError(null);
                    if (employee) {
                      setEditForm({
                        name: employee.name,
                        role: employee.role,
                        department: employee.department,
                        email: employee.email,
                        phone: employee.phone,
                        active: employee.active
                      });
                    }
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEmployee}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                onClick={() => (window.location.href = `mailto:${employee.email}`)}
                className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined">mail</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{employee.email}</p>
                </div>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-500">chevron_right</span>
              </div>
              <div
                onClick={() => (window.location.href = `tel:${employee.phone.replace(/\D/g, "")}`)}
                className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined">call</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Telefone</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{employee.phone}</p>
                </div>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-500">chevron_right</span>
              </div>
              <div className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined">badge</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">ID Funcional</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                    #{employee.id.toUpperCase()}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
          Atividade Recente
        </h3>
        <div className="flex flex-col gap-3">
          {entries.length > 0 ? (
            entries.slice(0, 3).map((entry) => {
              const isManualAdjustment = entry.source === "MANUAL_ADJUSTMENT" || Boolean(entry.correctionReason);
              const intervalLabel = entry.intervalType
                ? intervalTypeLabel(entry.intervalType, true)
                : "Intervalo";
              const icon =
                entry.type === "CLOCK_IN"
                  ? "login"
                  : entry.type === "CLOCK_OUT"
                    ? "logout"
                    : entry.type === "BREAK_START"
                      ? "pause_circle"
                      : "play_circle";
              const label =
                entry.type === "CLOCK_IN"
                  ? "Entrada"
                  : entry.type === "CLOCK_OUT"
                    ? "Saida"
                    : entry.type === "BREAK_START"
                      ? `Inicio ${intervalLabel}`
                      : `Fim ${intervalLabel}`;

              return (
                <div
                  key={entry.id}
                  className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        isManualAdjustment
                          ? "bg-indigo-100 text-indigo-600"
                          : entry.type === "CLOCK_IN"
                            ? "bg-green-100 text-green-600"
                            : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      <span className="material-symbols-outlined">{isManualAdjustment ? "edit_calendar" : icon}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {isManualAdjustment ? `Ajuste - ${label}` : label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(entry.timestamp).toLocaleDateString("pt-BR")}
                      </p>
                      {entry.correctionReason && (
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-300 truncate max-w-[180px]">
                          {entry.correctionReason}
                        </p>
                      )}
                      {entry.scheduleViolation && entry.scheduleNote && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-300 truncate max-w-[180px]">
                          {entry.scheduleNote}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-mono font-medium text-slate-600 dark:text-slate-300">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">history_toggle_off</span>
              <p>Sem registros recentes.</p>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/historico", { state: { userId: employee.id, userName: employee.name } })}
          className="w-full py-3 mt-4 rounded-xl border border-slate-200 dark:border-slate-700 text-primary font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
        >
          <span>Ver Historico Completo</span>
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
