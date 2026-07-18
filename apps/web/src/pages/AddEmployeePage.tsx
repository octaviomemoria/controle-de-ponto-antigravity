import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PhotoPicker, { type PhotoSelection } from "../components/PhotoPicker";
import { useAuth } from "../lib/auth";
import { appendAuditLog } from "../lib/audit";
import { createEmployee, employeeEmailExists, loadEmployees } from "../lib/employees";
import { appendInvitation, type InvitationRole } from "../lib/invitationsRepo";
import {
  addDepartmentCatalogItem,
  addJobTitleCatalogItem,
  loadOrganizationCatalog,
  readDepartmentCatalog,
  readJobTitleCatalog,
  type OrganizationCatalog
} from "../lib/orgCatalogRepo";
import {
  loadWorkSchedules,
  readCachedWorkSchedules,
  saveProfileScheduleId,
  type WorkSchedule
} from "../lib/workSchedulesRepo";
import { isUuid } from "../lib/profileRepo";
import { supabase } from "../lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_CATALOG_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;

type CatalogModalType = "department" | "jobTitle" | null;
type AccessMode = "invite" | "temp_password";

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function generateTempPassword(length = 10): string {
  const chars = TEMP_PASSWORD_CHARS;
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function syncFormWithCatalog(
  current: { department: string; role: string; name: string; email: string },
  catalog: OrganizationCatalog
) {
  const department = catalog.departments.includes(current.department)
    ? current.department
    : (catalog.departments[0] ?? "");

  const role =
    current.role && catalog.jobTitles.includes(current.role)
      ? current.role
      : current.role || catalog.jobTitles[0] || "";

  return { ...current, department, role };
}

function inferInvitationRole(jobTitle: string): InvitationRole {
  const normalized = jobTitle.trim().toLowerCase();
  if (normalized.includes("gestor") || normalized.includes("manager")) return "MANAGER";
  if (normalized.includes("lider")) return "LEADER";
  return "EMPLOYEE";
}

export default function AddEmployeePage() {
  const navigate = useNavigate();
  const { user, supabaseEnabled } = useAuth();
  const canUseRemoteAdmin =
    supabaseEnabled && user?.mode === "supabase" && isUuid(user?.id) && Boolean(supabase);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    department: "",
    email: ""
  });
  const [catalog, setCatalog] = useState<OrganizationCatalog>(() => ({
    departments: readDepartmentCatalog(),
    jobTitles: readJobTitleCatalog()
  }));
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [catalogModalType, setCatalogModalType] = useState<CatalogModalType>(null);
  const [newCatalogValue, setNewCatalogValue] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogSaving, setIsCatalogSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("invite");
  const [tempPassword, setTempPassword] = useState<string>("");
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>(() =>
    readCachedWorkSchedules()
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");

  useEffect(() => {
    let active = true;

    const refreshCatalog = async () => {
      await loadEmployees();
      const nextCatalog = await loadOrganizationCatalog(user?.id);
      const schedules = await loadWorkSchedules(user?.id);
      if (!active) return;
      setCatalog(nextCatalog);
      setFormData((prev) => syncFormWithCatalog(prev, nextCatalog));
      setWorkSchedules(schedules);
      setSelectedScheduleId((current) => {
        if (current) return current;
        const defaultId = schedules.find((schedule) => schedule.isDefault)?.id ?? schedules[0]?.id ?? "";
        return defaultId;
      });
    };

    void refreshCatalog();
    window.addEventListener("storage", refreshCatalog);
    window.addEventListener("focus", refreshCatalog);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshCatalog);
      window.removeEventListener("focus", refreshCatalog);
    };
  }, [user?.id]);

  const updateField = (field: "name" | "role" | "department" | "email", value: string) => {
    setFormError(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  const handleAvatarSelect = (selection: PhotoSelection) => {
    setFormError(null);
    setAvatarPreview(selection.dataUrl);
  };

  const handleAvatarRemove = () => {
    setFormError(null);
    setAvatarPreview(null);
  };

  const openCatalogModal = (type: Exclude<CatalogModalType, null>) => {
    setCatalogModalType(type);
    setCatalogError(null);
    setNewCatalogValue("");
  };

  const closeCatalogModal = (force = false) => {
    if (isCatalogSaving && !force) return;
    setCatalogModalType(null);
    setCatalogError(null);
    setNewCatalogValue("");
  };

  const handleCatalogCreate = async () => {
    if (!catalogModalType) return;
    setCatalogError(null);
    const normalized = newCatalogValue.trim().replace(/\s+/g, " ");
    if (normalized.length < MIN_CATALOG_NAME_LENGTH) {
      setCatalogError("Informe um nome valido com pelo menos 2 caracteres.");
      return;
    }

    setIsCatalogSaving(true);
    try {
      if (catalogModalType === "department") {
        const result = await addDepartmentCatalogItem(normalized, user?.id);
        const nextCatalog = await loadOrganizationCatalog(user?.id);
        setCatalog(nextCatalog);
        setFormData((prev) => ({
          ...syncFormWithCatalog(prev, nextCatalog),
          department: result.name
        }));
        appendAuditLog({
          actorId: user?.id,
          action: "department_created",
          entityType: "department",
          payload: {
            name: result.name,
            synced: result.synced
          }
        });
      } else {
        const result = addJobTitleCatalogItem(normalized);
        const nextCatalog = await loadOrganizationCatalog(user?.id);
        setCatalog(nextCatalog);
        setFormData((prev) => ({
          ...syncFormWithCatalog(prev, nextCatalog),
          role: result.name
        }));
        appendAuditLog({
          actorId: user?.id,
          action: "job_title_created",
          entityType: "job_title",
          payload: {
            name: result.name
          }
        });
      }
      closeCatalogModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel cadastrar.";
      setCatalogError(message);
    } finally {
      setIsCatalogSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedName = formData.name.trim().replace(/\s+/g, " ");
    const normalizedRole = formData.role.trim().replace(/\s+/g, " ");
    const normalizedEmail = formData.email.trim().toLowerCase();

    if (normalizedName.length < 3) {
      setFormError("Nome invalido. Informe nome e sobrenome.");
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setFormError("Email corporativo invalido.");
      return;
    }
    if (employeeEmailExists(normalizedEmail)) {
      setFormError("Ja existe um colaborador com este email.");
      return;
    }
    if (normalizedRole.length < 2) {
      setFormError("Cargo invalido. Informe o cargo do colaborador.");
      return;
    }
    if (!formData.department.trim()) {
      setFormError("Selecione um departamento.");
      return;
    }
    if (canUseRemoteAdmin && accessMode === "temp_password") {
      if (tempPassword.trim().length < MIN_PASSWORD_LENGTH) {
        setFormError(`A senha temporaria deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const accessRole = inferInvitationRole(normalizedRole);

      if (canUseRemoteAdmin && supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          setFormError("Sessao expirada. Faça login novamente.");
          return;
        }

        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            email: normalizedEmail,
            name: normalizedName,
            role: accessRole,
            department: formData.department,
            accessMode,
            tempPassword: accessMode === "temp_password" ? tempPassword.trim() : undefined
          })
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string; userId?: string }
          | null;

        if (!response.ok) {
          setFormError(payload?.error ?? "Nao foi possivel cadastrar o colaborador.");
          return;
        }

        const userId = typeof payload?.userId === "string" ? payload?.userId : null;
        if (userId && selectedScheduleId) {
          await saveProfileScheduleId(userId, selectedScheduleId, user?.id);
        }

        const invitationResult =
          accessMode === "invite"
            ? await appendInvitation({
                actorUserId: user?.id,
                email: normalizedEmail,
                role: accessRole
              })
            : null;

        appendAuditLog({
          actorId: user?.id,
          action: "employee_created",
          entityType: "employee",
          entityId: userId ?? undefined,
          payload: {
            name: normalizedName,
            role: accessRole,
            department: formData.department,
            email: normalizedEmail,
            hasAvatar: Boolean(avatarPreview),
            scheduleId: selectedScheduleId || null,
            invitationId: invitationResult?.invitation.id ?? null,
            invitationSynced: invitationResult?.synced ?? false,
            accessMode
          }
        });

        await loadEmployees();

        const flash =
          accessMode === "invite"
            ? `Colaborador criado com sucesso: ${normalizedName}`
            : `Colaborador criado com sucesso: ${normalizedName}`;

        navigate("/equipe", { state: { flash } });
        return;
      }

      const createdEmployee = createEmployee({
        name: normalizedName,
        role: normalizedRole,
        department: formData.department,
        email: normalizedEmail,
        avatar: avatarPreview ?? undefined
      });
      if (selectedScheduleId) {
        await saveProfileScheduleId(createdEmployee.id, selectedScheduleId, user?.id);
      }
      const invitationResult = await appendInvitation({
        actorUserId: user?.id,
        email: normalizedEmail,
        role: accessRole
      });
      appendAuditLog({
        actorId: user?.id,
        action: "employee_created",
        entityType: "employee",
        entityId: createdEmployee.id,
        payload: {
          name: createdEmployee.name,
          role: createdEmployee.role,
          department: createdEmployee.department,
          email: createdEmployee.email,
          hasAvatar: Boolean(avatarPreview),
          scheduleId: selectedScheduleId || null,
          invitationId: invitationResult.invitation.id,
          invitationSynced: invitationResult.synced,
          accessMode: "demo"
        }
      });
      navigate("/equipe", {
        state: {
          flash: `Colaborador criado com sucesso: ${createdEmployee.name}`
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel cadastrar.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
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
        <h1 className="ml-2 text-lg font-bold text-slate-900 dark:text-white">Novo Colaborador</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-4 flex flex-col gap-6 max-w-lg mx-auto w-full">
        <div className="flex flex-col items-center py-4">
          <PhotoPicker
            value={avatarPreview}
            onSelect={handleAvatarSelect}
            onRemove={handleAvatarRemove}
            onError={(message) => setFormError(message)}
            maxSizeBytes={MAX_PHOTO_SIZE_BYTES}
            title="Foto do colaborador"
            description="Escolha como deseja adicionar a imagem."
            triggerClassName="h-24 w-24 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors relative overflow-hidden"
            triggerTitle="Adicionar foto"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Preview do colaborador" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-slate-400 text-3xl">add_a_photo</span>
            )}
            <div className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5 text-white shadow-sm">
              <span className="material-symbols-outlined text-sm">edit</span>
            </div>
          </PhotoPicker>
          <p className="text-xs text-slate-400 mt-2">Toque para adicionar foto</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Nome Completo</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Ex: Maria Silva"
            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email Corporativo</label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="Ex: maria@empresa.com"
            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Departamento</label>
              <button
                type="button"
                onClick={() => openCatalogModal("department")}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-blue-50 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Novo
              </button>
            </div>
            <div className="relative">
              <select
                value={formData.department}
                onChange={(e) => updateField("department", e.target.value)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none transition-all"
                required
              >
                {catalog.departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                expand_more
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Cargo</label>
              <button
                type="button"
                onClick={() => openCatalogModal("jobTitle")}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-blue-50 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Novo
              </button>
            </div>
            <div className="relative">
              <select
                required
                value={formData.role}
                onChange={(e) => updateField("role", e.target.value)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none transition-all"
              >
                {catalog.jobTitles.map((jobTitle) => (
                  <option key={jobTitle} value={jobTitle}>
                    {jobTitle}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                expand_more
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Jornada de Trabalho</label>
          <div className="relative">
            <select
              value={selectedScheduleId}
              onChange={(e) => setSelectedScheduleId(e.target.value)}
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none transition-all"
              required={workSchedules.length > 0}
            >
              {workSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}{schedule.isDefault ? " (Padrao)" : ""}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              expand_more
            </span>
          </div>
          {selectedScheduleId && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Turno: {workSchedules.find((s) => s.id === selectedScheduleId)?.shiftStart} -{" "}
              {workSchedules.find((s) => s.id === selectedScheduleId)?.shiftEnd} •
              Tolerancia{" "}
              {workSchedules.find((s) => s.id === selectedScheduleId)?.defaultToleranceMin ?? 0}min
            </p>
          )}
          {workSchedules.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              Nenhuma jornada configurada. Ajuste em Configuracoes da Empresa.
            </p>
          )}
        </div>

        {canUseRemoteAdmin ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Acesso inicial</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Escolha como o colaborador recebera a senha.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccessMode("invite")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  accessMode === "invite"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                Enviar convite
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessMode("temp_password");
                  if (!tempPassword) {
                    setTempPassword(generateTempPassword());
                  }
                }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  accessMode === "temp_password"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                Senha temporaria
              </button>
            </div>
            {accessMode === "temp_password" ? (
              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Senha temporaria
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempPassword}
                    onChange={(event) => setTempPassword(event.target.value)}
                    placeholder="Digite ou gere uma senha"
                    className="flex-1 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setTempPassword(generateTempPassword())}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Gerar
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Envie essa senha ao colaborador. Ele devera altera-la no primeiro acesso.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                O colaborador recebera um email com link para definir a senha.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Supabase nao configurado. Convites e senhas temporarias sao simulados no modo demo.
          </div>
        )}

        {formError && (
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{formError}</p>
        )}

        <div className="mt-auto pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Cadastrando...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">person_add</span>
                <span>Cadastrar Colaborador</span>
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-4">
            {canUseRemoteAdmin
              ? accessMode === "invite"
                ? "O colaborador recebera um link para definir a senha."
                : "Envie a senha temporaria ao colaborador."
              : "Convites sao simulados no modo demo."}
          </p>
        </div>
      </form>


      {catalogModalType && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {catalogModalType === "department" ? "Novo Departamento" : "Novo Cargo"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {catalogModalType === "department"
                ? "Cadastre um departamento para usar neste formulario."
                : "Cadastre um cargo para usar neste formulario."}
            </p>

            <label className="mt-4 block text-sm text-slate-600 dark:text-slate-300">
              Nome
              <input
                type="text"
                value={newCatalogValue}
                onChange={(event) => {
                  setCatalogError(null);
                  setNewCatalogValue(event.target.value);
                }}
                autoFocus
                placeholder={
                  catalogModalType === "department" ? "Ex: Marketing" : "Ex: Coordenador"
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>

            {catalogError && (
              <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{catalogError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => closeCatalogModal()}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCatalogCreate()}
                disabled={isCatalogSaving}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-70"
              >
                {isCatalogSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
