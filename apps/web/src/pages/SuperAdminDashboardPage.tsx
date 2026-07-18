import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockCompany } from "../data/mockCompanies";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  createCompany,
  listCachedCompanies,
  loadCompanies,
  updateCompany,
  updateCompanyTrackingMode
} from "../lib/companiesRepo";
import { listEmployees, loadEmployees } from "../lib/employees";

type Tab = "home" | "companies" | "users";
type EditCompanyForm = {
  id: string;
  name: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  logoUrl: string;
  workHours: number;
  toleranceMinutes: number;
  timezone: string;
  timeTrackingMode: "SIMPLE" | "FULL";
};

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [companies, setCompanies] = useState(() => listCachedCompanies());
  const [users, setUsers] = useState(() => listEmployees());
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [editForm, setEditForm] = useState<EditCompanyForm | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    let activeCompanies = true;
    let activeUsers = true;
    const refreshCompanies = () => {
      setCompanies(listCachedCompanies());
      void loadCompanies().then((next) => {
        if (!activeCompanies) return;
        setCompanies(next);
      });
    };

    refreshCompanies();
    const refreshUsers = () => {
      setUsers(listEmployees());
      void loadEmployees().then((next) => {
        if (!activeUsers) return;
        setUsers(next);
      });
    };
    refreshUsers();
    window.addEventListener("storage", refreshCompanies);
    window.addEventListener("focus", refreshCompanies);
    window.addEventListener("storage", refreshUsers);
    window.addEventListener("focus", refreshUsers);
    return () => {
      activeCompanies = false;
      activeUsers = false;
      window.removeEventListener("storage", refreshCompanies);
      window.removeEventListener("focus", refreshCompanies);
      window.removeEventListener("storage", refreshUsers);
      window.removeEventListener("focus", refreshUsers);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleDemoFilterClick = () => {
    setFeedback("Filtros indisponiveis na demo.");
  };

  const openCompanySiteSettings = (company: Pick<MockCompany, "id" | "name">) => {
    navigate("/configuracoes-empresa", {
      state: {
        openSiteModal: true,
        companyId: company.id,
        companyName: company.name
      }
    });
  };

  const toggleTrackingMode = async (companyId: string) => {
    const target = companies.find((company) => company.id === companyId);
    if (!target) return;

    const nextMode = target.settings.timeTrackingMode === "SIMPLE" ? "FULL" : "SIMPLE";
    setCompanies((prev) =>
      prev.map((company) =>
        company.id === companyId
          ? {
              ...company,
              settings: {
                ...company.settings,
                timeTrackingMode: nextMode
              }
            }
          : company
      )
    );

    const result = await updateCompanyTrackingMode(companyId, nextMode);
    setFeedback(
      result.synced
        ? "Modo de ponto atualizado e sincronizado."
        : "Modo de ponto atualizado localmente. Sincronizacao pendente."
    );
    appendAuditLog({
      companyId,
      actorId: user?.id,
      action: "company_tracking_mode_updated",
      entityType: "company_settings",
      entityId: companyId,
      payload: {
        timeTrackingMode: nextMode,
        synced: result.synced
      }
    });
  };

  const openEditCompany = (company: MockCompany) => {
    setEditForm({
      id: company.id,
      name: company.name,
      status: company.status,
      logoUrl: company.logoUrl ?? "",
      workHours: company.settings.workHours,
      toleranceMinutes: company.settings.toleranceMinutes,
      timezone: company.settings.timezone,
      timeTrackingMode: company.settings.timeTrackingMode
    });
  };

  const handleSaveCompany = async () => {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setFeedback("Informe o nome da empresa.");
      return;
    }

    const result = await updateCompany(editForm.id, {
      name: editForm.name,
      status: editForm.status,
      logoUrl: editForm.logoUrl,
      workHours: editForm.workHours,
      toleranceMinutes: editForm.toleranceMinutes,
      timezone: editForm.timezone,
      timeTrackingMode: editForm.timeTrackingMode
    });

    if (!result.company) {
      setFeedback("Empresa nao encontrada para atualizacao.");
      return;
    }

    setCompanies((prev) =>
      prev.map((company) => (company.id === result.company!.id ? result.company! : company))
    );
    setEditForm(null);
    setFeedback(
      result.synced
        ? "Empresa atualizada e sincronizada."
        : "Empresa atualizada localmente. Sincronizacao pendente."
    );
    appendAuditLog({
      companyId: result.company.id,
      actorId: user?.id,
      action: "company_updated",
      entityType: "company",
      entityId: result.company.id,
      payload: {
        name: result.company.name,
        status: result.company.status,
        timeTrackingMode: result.company.settings.timeTrackingMode,
        workHours: result.company.settings.workHours,
        toleranceMinutes: result.company.settings.toleranceMinutes,
        timezone: result.company.settings.timezone,
        synced: result.synced
      }
    });
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => company.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [companies, searchTerm]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => user.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, users]);

  const activeUsersCount = useMemo(
    () => users.filter((employee) => employee.active).length,
    [users]
  );

  const handleAddCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCompanyName.trim()) return;

    const result = await createCompany({ name: newCompanyName });
    setCompanies((prev) => [result.company, ...prev.filter((item) => item.id !== result.company.id)]);
    setNewCompanyName("");
    setShowAddCompany(false);
    setFeedback(
      result.synced
        ? `Empresa ${result.company.name} criada com sucesso.`
        : `Empresa ${result.company.name} criada localmente. Sincronizacao pendente.`
    );
    appendAuditLog({
      companyId: result.company.id,
      actorId: user?.id,
      action: "company_created",
      entityType: "company",
      entityId: result.company.id,
      payload: {
        name: result.company.name,
        synced: result.synced
      }
    });
  };

  const getHeaderTitle = () => {
    if (activeTab === "companies") return "Gestao de Empresas";
    if (activeTab === "users") return "Gestao de Usuarios";
    return "Visao Geral Clientes";
  };

  const renderCompanyCard = (company: (typeof companies)[number]) => (
    <div
      key={company.id}
      data-testid={`superadmin-company-card-${company.id}`}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden active:scale-[0.99] transition-transform duration-100"
    >
      <div className="p-4 flex gap-4">
        <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex-shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 flex items-center justify-center">
          {company.logoUrl ? (
            <img alt={company.name} className="w-full h-full object-cover" src={company.logoUrl} />
          ) : (
            <span className="material-symbols-outlined text-slate-400 text-3xl">apartment</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{company.name}</h3>
              <p
                className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${
                  company.status === "ACTIVE"
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                    : company.status === "SUSPENDED"
                      ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30"
                      : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30"
                }`}
              >
                {company.statusText}
              </p>
            </div>
            <button
              onClick={() => openEditCompany(company)}
              data-testid={`superadmin-company-edit-${company.id}`}
              className="text-slate-400 dark:text-slate-500 hover:text-primary transition-colors"
              title="Editar empresa"
            >
              <span className="material-symbols-outlined text-[20px]">more_horiz</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-700 pt-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Funcionarios</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {company.employeeCount} <span className="text-slate-400 text-[10px] font-normal">Ativos</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Pontos</p>
              <p className="text-sm font-bold text-primary">{company.totalPunches}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">Site A - Teste</p>

          <div className="mt-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Controle de Ponto
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {company.settings.timeTrackingMode === "SIMPLE"
                  ? "Simples (Entrada/Saida)"
                  : "Completo (Intervalos)"}
              </span>
            </div>
            <button
              onClick={() => void toggleTrackingMode(company.id)}
              data-testid={`superadmin-company-mode-toggle-${company.id}`}
              className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20 transition-colors"
            >
              Alterar
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => openCompanySiteSettings(company)}
              data-testid={`superadmin-company-add-branch-${company.id}`}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Adicionar filial
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white antialiased overflow-x-hidden min-h-screen pb-20" data-testid="superadmin-page">
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{getHeaderTitle()}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              data-testid="superadmin-open-reports"
              className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 sm:inline-flex"
            >
              Relatorios
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              data-testid="superadmin-open-csv"
              className="hidden rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 sm:inline-flex"
            >
              CSV
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              data-testid="superadmin-open-reports-icon"
              title="Abrir relatorios"
              className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">assessment</span>
            </button>
            <button
              onClick={handleDemoFilterClick}
              data-testid="superadmin-filters-button"
              className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">filter_list</span>
            </button>
            <button
              onClick={() => setShowAddCompany(true)}
              data-testid="superadmin-add-company-button"
              className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">add</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined text-[22px]">search</span>
            </div>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              data-testid="superadmin-search-input"
              className="block w-full p-3 pl-10 text-base text-slate-900 bg-white dark:bg-slate-800 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary focus:border-transparent placeholder-slate-400 shadow-sm transition-all"
              placeholder="Buscar empresas ou usuarios..."
              type="text"
            />
          </div>
        </div>
      </header>

      {feedback && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
            {feedback}
          </div>
        </div>
      )}

      {activeTab === "home" && (
        <>
          <section className="px-4 py-6">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Saude do Sistema
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 w-10 h-10 rounded-lg flex items-center justify-center text-primary mb-2">
                  <span className="material-symbols-outlined">domain</span>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{companies.length}</p>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Empresas</p>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 w-10 h-10 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2">
                  <span className="material-symbols-outlined">group</span>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{activeUsersCount}</p>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Usuarios Ativos</p>
                </div>
              </div>
            </div>
          </section>

          <section className="px-4 mb-6">
            <div className="flex flex-col rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Volume (7 Dias)</p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    12,405 <span className="text-base font-normal text-slate-500 dark:text-slate-500">Horas</span>
                  </h3>
                </div>
              </div>

              <div className="relative h-40 w-full overflow-hidden">
                <svg
                  className="overflow-visible"
                  fill="none"
                  height="100%"
                  preserveAspectRatio="none"
                  viewBox="0 0 472 160"
                  width="100%"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient gradientUnits="userSpaceOnUse" id="chartGradient" x1="236" x2="236" y1="20" y2="160">
                      <stop stopColor="#137fec" stopOpacity="0.2"></stop>
                      <stop offset="1" stopColor="#137fec" stopOpacity="0"></stop>
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 119C18.1538 119 18.1538 31 36.3077 31C54.4615 31 54.4615 51 72.6154 51C90.7692 51 90.7692 103 108.923 103C127.077 103 127.077 43 145.231 43C163.385 43 163.385 111 181.538 111C199.692 111 199.692 71 217.846 71C236 71 236 55 254.154 55C272.308 55 272.308 131 290.462 131C308.615 131 308.615 159 326.769 159C344.923 159 344.923 11 363.077 11C381.231 11 381.231 91 399.385 91C417.538 91 417.538 139 435.692 139C453.846 139 453.846 35 472 35V160H0V119Z"
                    fill="url(#chartGradient)"
                  ></path>
                  <path
                    d="M0 119C18.1538 119 18.1538 31 36.3077 31C54.4615 31 54.4615 51 72.6154 51C90.7692 51 90.7692 103 108.923 103C127.077 103 127.077 43 145.231 43C163.385 43 163.385 111 181.538 111C199.692 111 199.692 71 217.846 71C236 71 236 55 254.154 55C272.308 55 272.308 131 290.462 131C308.615 131 308.615 159 326.769 159C344.923 159 344.923 11 363.077 11C381.231 11 381.231 91 399.385 91C417.538 91 417.538 139 435.692 139C453.846 139 453.846 35 472 35"
                    stroke="#137fec"
                    strokeLinecap="round"
                    strokeWidth="3"
                  ></path>
                </svg>
              </div>
            </div>
          </section>

          <section className="px-4 pb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Empresas Registradas</h2>
              <button
                onClick={() => setActiveTab("companies")}
                data-testid="superadmin-view-all-companies"
                className="text-sm font-medium text-primary hover:text-blue-700 dark:hover:text-blue-400 flex items-center gap-1"
              >
                Ver Todas
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {filteredCompanies.slice(0, 3).map((company) => renderCompanyCard(company))}
            </div>
          </section>
        </>
      )}

      {activeTab === "companies" && (
        <section className="px-4 pb-6 pt-2">
          <div className="flex flex-col gap-4">
            {filteredCompanies.length > 0 ? (
              filteredCompanies.map((company) => renderCompanyCard(company))
            ) : (
              <div className="text-center py-10 text-slate-500">Nenhuma empresa encontrada</div>
            )}
          </div>
        </section>
      )}

      {activeTab === "users" && (
        <section className="px-4 pb-6 pt-2">
          <div className="flex flex-col gap-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => navigate(`/colaboradores/${user.id}`)}
                data-testid={`superadmin-user-card-${user.id}`}
                className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex-shrink-0 overflow-hidden">
                  <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.role}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      {user.department || "Geral"}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        user.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/colaboradores/${user.id}`);
                  }}
                  data-testid={`superadmin-user-edit-${user.id}`}
                  className="p-2 text-slate-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {editForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-zoom-in-95">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Editar Empresa</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Nome</span>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Status</span>
                  <select
                    value={editForm.status}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: event.target.value as EditCompanyForm["status"]
                            }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="TRIAL">Trial</option>
                    <option value="SUSPENDED">Suspensa</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Modo</span>
                  <select
                    value={editForm.timeTrackingMode}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              timeTrackingMode: event.target.value as "SIMPLE" | "FULL"
                            }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                  >
                    <option value="FULL">Completo</option>
                    <option value="SIMPLE">Simples</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Jornada (h)</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={editForm.workHours}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, workHours: Number(event.target.value) || 8 } : prev
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Tolerancia (min)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={editForm.toleranceMinutes}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev
                          ? { ...prev, toleranceMinutes: Number(event.target.value) || 0 }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-500">Timezone</span>
                <input
                  value={editForm.timezone}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, timezone: event.target.value } : prev))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-500">Logo URL</span>
                <input
                  value={editForm.logoUrl}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, logoUrl: event.target.value } : prev))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                  placeholder="https://..."
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Filiais e geofence
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Gerencie locais permitidos em Configuracoes da Empresa.
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                  Site A - Teste
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditForm(null);
                    openCompanySiteSettings({
                      id: editForm.id,
                      name: editForm.name
                    });
                  }}
                  className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600"
                >
                  Adicionar filial
                </button>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="flex-1 py-3 font-bold text-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCompany()}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddCompany && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-zoom-in-95">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Nova Empresa</h3>
            <form onSubmit={handleAddCompany}>
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-2">Nome Fantasia</label>
              <input
                value={newCompanyName}
                onChange={(event) => setNewCompanyName(event.target.value)}
                data-testid="superadmin-new-company-name-input"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
                required
              />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddCompany(false)}
                  className="flex-1 py-3 font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="superadmin-create-company-submit"
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 w-full max-w-md bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 pb-safe pt-2 left-1/2 -translate-x-1/2 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        <div className="flex justify-around items-center px-4 h-16">
          <button
            onClick={() => setActiveTab("home")}
            data-testid="superadmin-tab-home"
            className={`flex flex-col items-center gap-1 w-16 transition-colors ${
              activeTab === "home"
                ? "text-primary"
                : "text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary"
            }`}
          >
            <span className={`material-symbols-outlined ${activeTab === "home" ? "filled" : ""}`}>dashboard</span>
            <span className="text-[10px] font-medium">Home</span>
          </button>

          <button
            onClick={() => setActiveTab("companies")}
            data-testid="superadmin-tab-companies"
            className={`flex flex-col items-center gap-1 w-16 transition-colors ${
              activeTab === "companies"
                ? "text-primary"
                : "text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary"
            }`}
          >
            <span className={`material-symbols-outlined ${activeTab === "companies" ? "filled" : ""}`}>business</span>
            <span className="text-[10px] font-medium">Empresas</span>
          </button>

          <div className="relative -top-6">
            <button
              onClick={() => setShowAddCompany(true)}
              data-testid="superadmin-fab-add-company"
              className="w-14 h-14 bg-primary rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center text-white hover:bg-blue-600 transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-[28px]">add_business</span>
            </button>
          </div>

          <button
            onClick={() => setActiveTab("users")}
            data-testid="superadmin-tab-users"
            className={`flex flex-col items-center gap-1 w-16 transition-colors ${
              activeTab === "users"
                ? "text-primary"
                : "text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary"
            }`}
          >
            <span className={`material-symbols-outlined ${activeTab === "users" ? "filled" : ""}`}>group</span>
            <span className="text-[10px] font-medium">Usuarios</span>
          </button>

          <button
            onClick={handleLogout}
            data-testid="superadmin-logout-button"
            className="flex flex-col items-center gap-1 w-16 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-[10px] font-medium">Sair</span>
          </button>
        </div>
        <div className="h-4 w-full bg-white dark:bg-slate-800"></div>
      </nav>
    </div>
  );
}
