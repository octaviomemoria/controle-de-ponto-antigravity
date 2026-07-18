import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listEmployees, loadEmployees } from "../lib/employees";
import { syncPendingInvitations } from "../lib/invitationsRepo";
import {
  loadLeaderAssignments,
  readAssignedEmployees,
  readAllLeaderAssignments
} from "../lib/leaderAssignmentsRepo";
import { isAdminRole } from "../lib/roles";

type StatusFilter = "Todos" | "Presente" | "Ausente";
type SortOrder = "asc" | "desc";
type DepartmentFilter = "Todos" | string;

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function TeamPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("Todos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [employees, setEmployees] = useState(() => listEmployees());
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [leaderFilterId, setLeaderFilterId] = useState<string>("ALL");
  const [leaderAssignments, setLeaderAssignments] = useState(() =>
    readAllLeaderAssignments()
  );
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refreshEmployees = () => {
      setEmployees(listEmployees());
      void syncPendingInvitations(user?.id)
        .catch(() => {
          // keep local fallback if sync fails
        })
        .finally(() => {
          void loadEmployees().then((next) => {
            if (!active) return;
            setEmployees(next);
          });
        });
    };
    refreshEmployees();

    window.addEventListener("storage", refreshEmployees);
    window.addEventListener("focus", refreshEmployees);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshEmployees);
      window.removeEventListener("focus", refreshEmployees);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || user.role !== "LEADER") return;
    let active = true;

    const refreshAssignments = async () => {
      await loadLeaderAssignments(user.id);
      if (!active) return;
      setAssignedEmployeeIds(readAssignedEmployees(user.id));
    };

    void refreshAssignments();
    window.addEventListener("storage", refreshAssignments);
    window.addEventListener("focus", refreshAssignments);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshAssignments);
      window.removeEventListener("focus", refreshAssignments);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id) return;
    if (!isAdminRole(user.role)) return;
    let active = true;

    const refreshAssignments = async () => {
      await loadLeaderAssignments(user.id);
      if (!active) return;
      setLeaderAssignments(readAllLeaderAssignments());
    };

    void refreshAssignments();
    window.addEventListener("storage", refreshAssignments);
    window.addEventListener("focus", refreshAssignments);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshAssignments);
      window.removeEventListener("focus", refreshAssignments);
    };
  }, [user?.id, user?.role]);

  const leaderOptions = useMemo(() => {
    return employees.filter((entry) => entry.role.toLowerCase().includes("lider"));
  }, [employees]);

  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    employees.forEach((entry) => {
      if (entry.department?.trim()) {
        departments.add(entry.department.trim());
      }
    });
    return ["Todos", ...Array.from(departments).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [employees]);

  const leaderByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    leaderAssignments.forEach((assignment) => {
      map.set(assignment.employeeId, assignment.leaderId);
    });
    return map;
  }, [leaderAssignments]);

  useEffect(() => {
    const state = location.state as { flash?: string } | null;
    if (!state?.flash) return;
    setFlashMessage(state.flash);
    navigate(location.pathname, { replace: true, state: null });
    const timer = setTimeout(() => setFlashMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  const filteredEmployees = useMemo(() => {
    let baseEmployees = employees;
    if (user?.role === "LEADER") {
      baseEmployees = employees.filter((employee) => assignedEmployeeIds.includes(employee.id));
    } else if (leaderFilterId !== "ALL") {
      if (leaderFilterId === "NONE") {
        baseEmployees = employees.filter((employee) => !leaderByEmployee.get(employee.id));
      } else {
        baseEmployees = employees.filter(
          (employee) => leaderByEmployee.get(employee.id) === leaderFilterId
        );
      }
    }

    const filtered = baseEmployees.filter((employee) => {
      const normalizedSearch = normalizeSearchValue(searchTerm);
      const normalizedName = normalizeSearchValue(employee.name);
      const normalizedRole = normalizeSearchValue(employee.role);
      const matchesNameByToken = normalizedName
        .split(/\s+/)
        .some((token) => token.startsWith(normalizedSearch));
      const matchesNameByContains =
        normalizedSearch.length >= 2 && normalizedName.includes(normalizedSearch);
      const matchesName =
        !normalizedSearch || matchesNameByToken || matchesNameByContains;
      const matchesRole =
        normalizedSearch.length >= 2 &&
        normalizedRole.includes(normalizedSearch);
      const matchesSearch = matchesName || matchesRole;
      const matchesDepartment =
        departmentFilter === "Todos" || employee.department === departmentFilter;

      let matchesStatus = true;
      if (statusFilter === "Presente") matchesStatus = employee.active;
      if (statusFilter === "Ausente") matchesStatus = !employee.active;

      return matchesSearch && matchesStatus && matchesDepartment;
    });

    return filtered.sort((a, b) => {
      if (sortOrder === "asc") return a.name.localeCompare(b.name);
      return b.name.localeCompare(a.name);
    });
  }, [
    employees,
    assignedEmployeeIds,
    leaderFilterId,
    leaderByEmployee,
    departmentFilter,
    searchTerm,
    sortOrder,
    statusFilter,
    user?.role
  ]);

  const isManager = isAdminRole(user?.role);
  const canManageEmployees = isManager || user?.mode === "demo";

  const getTitle = () => {
    if (user?.role === "LEADER") return "Minha Equipe";
    if (isManager) return "Colaboradores";
    return "Equipe";
  };

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const getChipStyle = (filterName: StatusFilter) => {
    const isActive = statusFilter === filterName;
    return isActive
      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent font-bold"
      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium";
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light dark:bg-background-dark overflow-hidden pb-24" data-testid="team-page">
      <header className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between z-20 sticky top-0">
        <button
          onClick={() => navigate(-1)}
          data-testid="team-back-button"
          className="text-slate-900 dark:text-white flex size-12 shrink-0 items-center justify-start cursor-pointer transition-opacity hover:opacity-70"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">
            {getTitle()}
          </h2>
          <p className="text-xs text-slate-500 font-medium">{filteredEmployees.length} encontrados</p>
        </div>
        <div className="flex items-center justify-end gap-1 w-24">
          {canManageEmployees ? (
            <>
              <button
                onClick={() => navigate("/auditoria")}
                className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="Auditoria"
              >
                <span className="material-symbols-outlined text-2xl">fact_check</span>
              </button>
              <button
                onClick={() => navigate("/configuracoes-empresa")}
                className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="Configuracoes da Empresa"
              >
                <span className="material-symbols-outlined text-2xl">settings</span>
              </button>
            </>
          ) : (
            <button
              onClick={toggleSort}
              title={sortOrder === "asc" ? "Ordenar Z-A" : "Ordenar A-Z"}
              className="flex size-10 items-center justify-center cursor-pointer transition-opacity hover:opacity-70 text-primary"
            >
              <span className="material-symbols-outlined text-2xl">
                {sortOrder === "asc" ? "sort_by_alpha" : "sort"}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-2 bg-background-light dark:bg-background-dark z-10 shrink-0">
        {flashMessage && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            {flashMessage}
          </div>
        )}
        <label className="flex flex-col h-12 w-full mb-4">
          <div className="flex w-full flex-1 items-stretch rounded-xl h-full shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 flex border-none bg-white dark:bg-slate-800 items-center justify-center pl-4 rounded-l-xl border-r-0">
              <span className="material-symbols-outlined">search</span>
            </div>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="team-search-input"
              className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border-none bg-white dark:bg-slate-800 focus:border-none h-full placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal transition-all"
              placeholder="Buscar por nome ou cargo..."
            />
          </div>
        </label>

        {isAdminRole(user?.role) && (
          <label className="mb-4 block text-xs text-slate-500 dark:text-slate-400">
            Filtrar por lider
            <select
              value={leaderFilterId}
              onChange={(event) => setLeaderFilterId(event.target.value)}
              data-testid="team-leader-filter-select"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="ALL">Todos os lideres</option>
              <option value="NONE">Sem lider atribuido</option>
              {leaderOptions.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.name} • {leader.department}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-4 block text-xs text-slate-500 dark:text-slate-400">
          Departamento
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            data-testid="team-department-filter-select"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {departmentOptions
            .filter((department) => department !== "Todos")
            .map((department) => (
              <button
                key={department}
                type="button"
                onClick={() => setDepartmentFilter(department)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  departmentFilter === department
                    ? "border-primary bg-blue-50 text-primary dark:bg-blue-900/20"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {department}
              </button>
            ))}
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {["Todos", "Presente", "Ausente"].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter as StatusFilter)}
              data-testid={`team-status-filter-${filter.toLowerCase()}`}
              className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full border pl-5 pr-5 transition-colors ${getChipStyle(
                filter as StatusFilter
              )}`}
            >
              <p className="text-sm leading-normal">{filter}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 space-y-3">
        {filteredEmployees.length > 0 ? (
          filteredEmployees.map((employee) => (
            <div
              key={employee.id}
              onClick={() => navigate(`/colaboradores/${employee.id}`)}
              data-testid={`team-employee-card-${employee.id}`}
              className="flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 cursor-pointer hover:border-primary/50 transition-colors group"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="relative">
                  <div
                    className={`bg-center bg-no-repeat aspect-square bg-cover rounded-full h-12 w-12 ${
                      !employee.active ? "grayscale opacity-80" : ""
                    }`}
                    style={{ backgroundImage: `url("${employee.avatar}")` }}
                  ></div>
                  {employee.active ? (
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-slate-800"></div>
                  ) : (
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-rose-400 border-2 border-white dark:border-slate-800"></div>
                  )}
                </div>
                <div className={`flex flex-col justify-center ${!employee.active ? "opacity-70" : ""}`}>
                  <p className="text-slate-900 dark:text-white text-base font-bold leading-normal truncate group-hover:text-primary transition-colors">
                    {employee.name}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-normal truncate">
                    {employee.role}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span
                    className={`hidden sm:block px-2.5 py-1 rounded-full text-xs font-bold ${
                      employee.active
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-rose-100 dark:bg-rose-900/30 text-rose-500 dark:text-rose-300"
                    }`}
                  >
                    {employee.active ? "Em dia" : "Ausente"}
                  </span>
                  {!employee.active && (
                    <span className="text-[10px] text-rose-500 font-bold mt-1">Acao Req.</span>
                  )}
                </div>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-xl">
                  chevron_right
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400" data-testid="team-empty-state">
            <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
            <p>
              {user?.role === "LEADER"
                ? "Nenhum colaborador atribuido ao seu perfil."
                : "Nenhum colaborador encontrado."}
            </p>
            {user?.role === "LEADER" && (
              <p className="mt-2 text-xs text-slate-400">
                Solicite ao gestor a atribuicao dos colaboradores.
              </p>
            )}
          </div>
        )}
        <div className="h-10"></div>
      </div>

      {canManageEmployees && (
        <div className="absolute bottom-[90px] right-4 z-30 animate-pop-in">
          <button
            onClick={() => navigate("/colaboradores/novo")}
            data-testid="team-add-employee-button"
            className="flex items-center justify-center size-14 rounded-full bg-primary shadow-lg shadow-primary/30 text-white hover:bg-blue-600 transition-transform hover:scale-105 active:scale-95"
          >
            <span className="material-symbols-outlined text-3xl">person_add</span>
          </button>
        </div>
      )}
    </div>
  );
}
