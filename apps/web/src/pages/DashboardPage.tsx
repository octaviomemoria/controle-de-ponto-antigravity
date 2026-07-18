import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  loadAbsenceJustifications,
  readCachedAbsenceJustifications,
  type AbsenceJustification
} from "../lib/absenceRepo";
import { useAuth } from "../lib/auth";
import {
  loadCertificates,
  readCachedCertificates,
  type CertificateRecord
} from "../lib/certificatesRepo";
import {
  loadCompanySettings,
  readCachedCompanySettings,
  type CompanySettings
} from "../lib/companySettingsRepo";
import { listEmployees, loadEmployees } from "../lib/employees";
import {
  getUnreadNotificationsCount,
  refreshOperationalNotifications
} from "../lib/notifications";
import {
  loadTimeEntries,
  readCachedTimeEntries,
  type TimeEntryRecord
} from "../lib/timeEntriesRepo";

type Period = "Mes" | "Semana";
type ReportFormat = "PDF" | "CSV" | "XLSX";
type MetricFilter = "ALL" | "OVERTIME" | "ABSENT";
type ReportTemplate = {
  id: string;
  title: string;
  description: string;
  audience: string;
  badge: string;
  icon: string;
};

type ReportStatus = "Ok" | "Extra" | "Ausente" | "Atraso";

type ReportRow = {
  id: string;
  name: string;
  role: string;
  dept: string;
  avatar: string;
  totalMinutes: number;
  expectedMinutes: number;
  varianceMinutes: number;
  status: ReportStatus;
  progress: number;
  hoursFormatted: string;
  expectedFormatted: string;
  justifiedDays: number;
  pendingCertificates: number;
  pendingAbsences: number;
  absenceRequests: number;
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function parseDateOnly(date: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function countBusinessDays(start: Date, end: Date): number {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);
  let count = 0;

  while (cursor.getTime() <= limit.getTime()) {
    if (isBusinessDay(cursor)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function getPeriodRange(period: Period, offset: number, reference: Date): DateRange {
  if (period === "Semana") {
    const end = new Date(reference);
    end.setDate(end.getDate() - offset * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const label = `${start.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    })}-${end.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    })}`;
    return { start, end, label };
  }

  const start = new Date(reference.getFullYear(), reference.getMonth() - offset, 1, 0, 0, 0, 0);
  const cutoffDay = reference.getDate();
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const endDay = Math.min(cutoffDay, lastDay);
  const end = new Date(start.getFullYear(), start.getMonth(), endDay, 23, 59, 59, 999);
  const label = start.toLocaleDateString("pt-BR", { month: "short" });
  return {
    start,
    end,
    label: label.charAt(0).toUpperCase() + label.slice(1)
  };
}

function rangeOverlaps(
  startMs: number,
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number
): boolean {
  return startMs <= rangeEndMs && endMs >= rangeStartMs;
}

function computeWorkedMinutes(
  entries: TimeEntryRecord[],
  rangeStartMs: number,
  rangeEndMs: number
): number {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let openStartMs: number | null = null;
  let workedMs = 0;

  sorted.forEach((entry) => {
    const entryTime = new Date(entry.timestamp).getTime();
    if (Number.isNaN(entryTime)) return;

    if (entry.type === "CLOCK_IN" || entry.type === "BREAK_END") {
      openStartMs = entryTime;
      return;
    }

    if (entry.type === "CLOCK_OUT" || entry.type === "BREAK_START") {
      if (openStartMs === null) return;
      const segmentStart = Math.max(openStartMs, rangeStartMs);
      const segmentEnd = Math.min(entryTime, rangeEndMs);
      if (segmentEnd > segmentStart) {
        workedMs += segmentEnd - segmentStart;
      }
      openStartMs = null;
    }
  });

  if (openStartMs !== null) {
    const nowMs = Date.now();
    const segmentStart = Math.max(openStartMs, rangeStartMs);
    const segmentEnd = Math.min(nowMs, rangeEndMs);
    if (segmentEnd > segmentStart) {
      workedMs += segmentEnd - segmentStart;
    }
  }

  return Math.floor(workedMs / 60000);
}

function collectJustifiedBusinessDays(
  employeeId: string,
  certificates: CertificateRecord[],
  absences: AbsenceJustification[],
  rangeStart: Date,
  rangeEnd: Date
): Set<string> {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const justified = new Set<string>();

  absences.forEach((absence) => {
    if (absence.employeeId !== employeeId || absence.status !== "APPROVED") return;
    const date = parseDateOnly(absence.date);
    if (!date || !isBusinessDay(date)) return;
    const dateMs = date.getTime();
    if (dateMs < rangeStartMs || dateMs > rangeEndMs) return;
    justified.add(date.toISOString().slice(0, 10));
  });

  certificates.forEach((certificate) => {
    if (certificate.userId !== employeeId || certificate.status !== "APPROVED") return;
    const startDate = parseDateOnly(certificate.startDate);
    const endDate = parseDateOnly(certificate.endDate);
    if (!startDate || !endDate) return;
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    if (!rangeOverlaps(startMs, endMs, rangeStartMs, rangeEndMs)) return;

    const cursor = new Date(startDate);
    cursor.setHours(12, 0, 0, 0);
    const certEnd = new Date(endDate);
    certEnd.setHours(12, 0, 0, 0);

    while (cursor.getTime() <= certEnd.getTime()) {
      const cursorMs = cursor.getTime();
      if (
        cursorMs >= rangeStartMs &&
        cursorMs <= rangeEndMs &&
        isBusinessDay(cursor)
      ) {
        justified.add(cursor.toISOString().slice(0, 10));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return justified;
}

function countPendingCertificatesInRange(
  employeeId: string,
  certificates: CertificateRecord[],
  rangeStartMs: number,
  rangeEndMs: number
): number {
  return certificates.filter((certificate) => {
    if (certificate.userId !== employeeId || certificate.status !== "PENDING") return false;
    const startDate = parseDateOnly(certificate.startDate);
    const endDate = parseDateOnly(certificate.endDate);
    if (!startDate || !endDate) return false;
    return rangeOverlaps(startDate.getTime(), endDate.getTime(), rangeStartMs, rangeEndMs);
  }).length;
}

function countAbsencesInRange(
  employeeId: string,
  absences: AbsenceJustification[],
  rangeStartMs: number,
  rangeEndMs: number,
  status?: AbsenceJustification["status"]
): number {
  return absences.filter((absence) => {
    if (absence.employeeId !== employeeId) return false;
    if (status && absence.status !== status) return false;
    const date = parseDateOnly(absence.date);
    if (!date) return false;
    const ms = date.getTime();
    return ms >= rangeStartMs && ms <= rangeEndMs;
  }).length;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("Mes");
  const [deptFilter, setDeptFilter] = useState("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("ALL");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportFormat, setReportFormat] = useState<ReportFormat>("PDF");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [employees, setEmployees] = useState(() => listEmployees());
  const [timeEntries, setTimeEntries] = useState<TimeEntryRecord[]>(() =>
    readCachedTimeEntries()
  );
  const [certificates, setCertificates] = useState<CertificateRecord[]>(() =>
    readCachedCertificates()
  );
  const [absences, setAbsences] = useState<AbsenceJustification[]>(() =>
    readCachedAbsenceJustifications()
  );
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() =>
    readCachedCompanySettings()
  );
  const [isLoadingData, setIsLoadingData] = useState(true);
  const employeeListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const refreshFromCache = () => {
      setEmployees(listEmployees());
      setTimeEntries(readCachedTimeEntries());
      setCertificates(readCachedCertificates());
      setAbsences(readCachedAbsenceJustifications());
      setCompanySettings(readCachedCompanySettings());
    };

    const refresh = async () => {
      setIsLoadingData(true);
      refreshFromCache();
      const [nextEmployees, nextTimeEntries, nextCertificates, nextAbsences, nextSettings] =
        await Promise.all([
          loadEmployees(),
          loadTimeEntries(),
          loadCertificates(),
          loadAbsenceJustifications(),
          loadCompanySettings(user?.id)
        ]);
      if (!active) return;
      setEmployees(nextEmployees);
      setTimeEntries(nextTimeEntries);
      setCertificates(nextCertificates);
      setAbsences(nextAbsences);
      setCompanySettings(nextSettings);
      setIsLoadingData(false);
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
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const refreshNotifications = () => {
      refreshOperationalNotifications(user.id, user.role);
      if (!active) return;
      setUnreadNotifications(getUnreadNotificationsCount(user.id));
    };

    refreshNotifications();
    window.addEventListener("storage", refreshNotifications);
    window.addEventListener("focus", refreshNotifications);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshNotifications);
      window.removeEventListener("focus", refreshNotifications);
    };
  }, [user?.id, user?.role]);

  const entriesByUser = useMemo(() => {
    const map = new Map<string, TimeEntryRecord[]>();
    timeEntries.forEach((entry) => {
      if (!entry.userId) return;
      const existing = map.get(entry.userId) ?? [];
      existing.push(entry);
      map.set(entry.userId, existing);
    });
    map.forEach((entries) => {
      entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });
    return map;
  }, [timeEntries]);

  const currentRange = useMemo(() => getPeriodRange(period, 0, new Date()), [period]);

  const buildRowsForRange = (range: DateRange, scopedEmployees: typeof employees): ReportRow[] => {
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const businessDays = countBusinessDays(range.start, range.end);
    const toleranceBudget = businessDays * companySettings.tolerance;

    return scopedEmployees.map((employee) => {
      const employeeEntries = entriesByUser.get(employee.id) ?? [];
      const workedMinutes = computeWorkedMinutes(employeeEntries, startMs, endMs);
      const justifiedDays = collectJustifiedBusinessDays(
        employee.id,
        certificates,
        absences,
        range.start,
        range.end
      ).size;
      const expectedDays = Math.max(0, businessDays - justifiedDays);
      const expectedMinutes = expectedDays * companySettings.workHours * 60;
      const varianceMinutes = workedMinutes - expectedMinutes;
      const pendingCertificates = countPendingCertificatesInRange(
        employee.id,
        certificates,
        startMs,
        endMs
      );
      const pendingAbsences = countAbsencesInRange(
        employee.id,
        absences,
        startMs,
        endMs,
        "PENDING"
      );
      const absenceRequests = countAbsencesInRange(
        employee.id,
        absences,
        startMs,
        endMs
      );

      let status: ReportStatus = "Ok";
      if (!employee.active) {
        status = "Ausente";
      } else if (workedMinutes === 0 && expectedMinutes > 0) {
        status = "Ausente";
      } else if (varianceMinutes > toleranceBudget) {
        status = "Extra";
      } else if (varianceMinutes < -toleranceBudget) {
        status = "Atraso";
      }

      const progress =
        expectedMinutes > 0
          ? Math.min(100, Math.max(0, (workedMinutes / expectedMinutes) * 100))
          : workedMinutes > 0
            ? 100
            : 0;

      return {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        dept: employee.department,
        avatar: employee.avatar,
        totalMinutes: workedMinutes,
        expectedMinutes,
        varianceMinutes,
        status,
        progress,
        hoursFormatted: formatMinutes(workedMinutes),
        expectedFormatted: formatMinutes(expectedMinutes),
        justifiedDays,
        pendingCertificates,
        pendingAbsences,
        absenceRequests
      };
    });
  };

  const reportData = useMemo(() => {
    return buildRowsForRange(currentRange, employees);
  }, [
    absences,
    certificates,
    companySettings.tolerance,
    companySettings.workHours,
    currentRange,
    employees,
    entriesByUser
  ]);

  const departments = useMemo(() => {
    const set = new Set(employees.map((employee) => employee.department));
    return ["Todos", ...Array.from(set)];
  }, [employees]);

  const filteredData = useMemo(() => {
    return reportData.filter((item) => {
      const matchesDept = deptFilter === "Todos" || item.dept === deptFilter;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [reportData, deptFilter, searchTerm]);

  const stats = useMemo(() => {
    const totalMinutes = filteredData.reduce((sum, item) => sum + item.totalMinutes, 0);
    const overtimeMinutes = filteredData.reduce(
      (sum, item) => sum + Math.max(0, item.varianceMinutes),
      0
    );
    const expectedTotal = filteredData.reduce((sum, item) => sum + item.expectedMinutes, 0);
    const varianceTotal = filteredData.reduce((sum, item) => sum + item.varianceMinutes, 0);
    const absencesCount = filteredData.filter((item) => item.status === "Ausente").length;
    const trendPct = expectedTotal > 0 ? (varianceTotal / expectedTotal) * 100 : 0;

    return {
      total: `${Math.floor(totalMinutes / 60)}h`,
      trend: `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`,
      overtime: `${Math.floor(overtimeMinutes / 60)}h`,
      absences: absencesCount.toString()
    };
  }, [filteredData]);

  const trendData = useMemo(() => {
    if (filteredData.length === 0 || employees.length === 0) {
      return [
        { month: "P-2", overtime: 0, absence: 0 },
        { month: "P-1", overtime: 0, absence: 0 },
        { month: "Atual", overtime: 0, absence: 0 }
      ];
    }

    const scopedEmployeeIds = new Set(filteredData.map((item) => item.id));
    const scopedEmployees = employees.filter((employee) =>
      scopedEmployeeIds.has(employee.id)
    );
    const reference = new Date();

    return [2, 1, 0].map((offset) => {
      const range = getPeriodRange(period, offset, reference);
      const rows = buildRowsForRange(range, scopedEmployees);
      const overtimeMinutes = rows.reduce(
        (sum, row) => sum + Math.max(0, row.varianceMinutes),
        0
      );
      return {
        month: range.label,
        overtime: Math.floor(overtimeMinutes / 60),
        absence: rows.filter((row) => row.status === "Ausente").length
      };
    });
  }, [
    absences,
    certificates,
    companySettings.tolerance,
    companySettings.workHours,
    employees,
    entriesByUser,
    filteredData,
    period
  ]);

  const maxOvertime = Math.max(...trendData.map((d) => d.overtime), 10) * 1.2;
  const maxAbsence = Math.max(...trendData.map((d) => d.absence), 5) * 1.2;

  const operationalMetrics = useMemo(() => {
    const delayed = filteredData.filter((item) => item.status === "Atraso").length;
    const overtime = filteredData.filter((item) => item.status === "Extra").length;
    const onTrack = filteredData.filter((item) => item.status === "Ok").length;
    const absent = filteredData.filter((item) => item.status === "Ausente").length;
    const pendingCertificates = filteredData.reduce(
      (sum, item) => sum + item.pendingCertificates,
      0
    );
    const pendingAbsences = filteredData.reduce(
      (sum, item) => sum + item.pendingAbsences,
      0
    );
    const absenceAdjustments = filteredData.reduce(
      (sum, item) => sum + item.absenceRequests,
      0
    );

    return {
      onTrack,
      delayed,
      overtime,
      absent,
      pendingCertificates,
      absenceAdjustments,
      pendingAbsences
    };
  }, [filteredData]);

  const capitalizedDate = useMemo(() => {
    if (period === "Semana") {
      return `Semana ${currentRange.start.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit"
      })} - ${currentRange.end.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit"
      })}`;
    }
    const currentMonthName = currentRange.start.toLocaleString("pt-BR", {
      month: "long",
      year: "numeric"
    });
    return currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);
  }, [currentRange.end, currentRange.start, period]);

  const reportTemplates = useMemo<ReportTemplate[]>(
    () => [
      {
        id: "espelho-mensal",
        title: "Espelho Mensal",
        description: `Consolidado por colaborador no periodo com ${filteredData.length} colaborador(es) filtrado(s).`,
        audience: "RH / DP",
        badge: period,
        icon: "calendar_month"
      },
      {
        id: "banco-horas",
        title: "Banco de Horas",
        description: `${operationalMetrics.overtime} com hora extra e ${operationalMetrics.delayed} com saldo negativo.`,
        audience: "Lideranca",
        badge: "Jornada",
        icon: "schedule"
      },
      {
        id: "assiduidade",
        title: "Assiduidade",
        description: `${operationalMetrics.onTrack} em dia e ${operationalMetrics.absent} ausente(s) no filtro atual.`,
        audience: "Operacao",
        badge: "Presenca",
        icon: "monitoring"
      },
      {
        id: "pendencias",
        title: "Pendencias de Aprovacao",
        description: `${operationalMetrics.pendingCertificates} atestado(s) pendente(s) e ${operationalMetrics.pendingAbsences} abono(s) pendente(s).`,
        audience: "Gestao",
        badge: "SLA",
        icon: "fact_check"
      }
    ],
    [filteredData.length, operationalMetrics, period]
  );

  const selectedTemplate = useMemo(
    () => reportTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [reportTemplates, selectedTemplateId]
  );

  const metricFilterLabel =
    metricFilter === "OVERTIME"
      ? "Hora Extra"
      : metricFilter === "ABSENT"
        ? "Faltas"
        : "Todos";

  const visibleRows = useMemo(() => {
    if (metricFilter === "OVERTIME") {
      return filteredData.filter((row) => row.status === "Extra");
    }
    if (metricFilter === "ABSENT") {
      return filteredData.filter((row) => row.status === "Ausente");
    }
    return filteredData;
  }, [filteredData, metricFilter]);

  const applyMetricFilter = (next: MetricFilter) => {
    setMetricFilter(next);
    window.setTimeout(() => {
      employeeListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const handleCreateTemplateReport = (template: ReportTemplate) => {
    setReportFeedback(null);
    setReportName(`${template.title} - ${capitalizedDate}`);
    setReportFormat("PDF");
    setSelectedTemplateId(template.id);
    setShowCreateModal(true);
  };

  const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

  const buildMirrorCsv = (rows: ReportRow[]) => {
    const headers = [
      "Nome",
      "Departamento",
      "Cargo",
      "Horas Trabalhadas",
      "Horas Esperadas",
      "Saldo (min)",
      "Status",
      "Dias Justificados",
      "Pend. Atestados",
      "Pend. Abonos"
    ].join(",");

    const body = rows
      .map((row) =>
        [
          csvCell(row.name),
          csvCell(row.dept),
          csvCell(row.role),
          csvCell(row.hoursFormatted),
          csvCell(row.expectedFormatted),
          csvCell(row.varianceMinutes),
          csvCell(row.status),
          csvCell(row.justifiedDays),
          csvCell(row.pendingCertificates),
          csvCell(row.pendingAbsences)
        ].join(",")
      )
      .join("\n");

    return `${headers}\n${body}`;
  };

  const downloadCsvFile = (filename: string, csv: string) => {
    const csvContent = "data:text/csv;charset=utf-8," + encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadXlsxFile = async (filename: string, title: string, rows: ReportRow[]) => {
    const { default: ExcelJS } = await import("exceljs");

    const summaryRows = [
      { Indicador: "Relatorio", Valor: title },
      { Indicador: "Periodo", Valor: capitalizedDate },
      { Indicador: "Gerado em", Valor: new Date().toLocaleString("pt-BR") },
      {
        Indicador: "Horas Trabalhadas",
        Valor: formatMinutes(rows.reduce((sum, row) => sum + row.totalMinutes, 0))
      },
      {
        Indicador: "Horas Esperadas",
        Valor: formatMinutes(rows.reduce((sum, row) => sum + row.expectedMinutes, 0))
      },
      { Indicador: "Saldo (min)", Valor: rows.reduce((sum, row) => sum + row.varianceMinutes, 0) }
    ];

    const detailRows = rows.map((row) => ({
      Nome: row.name,
      Departamento: row.dept,
      Cargo: row.role,
      "Horas Trabalhadas": row.hoursFormatted,
      "Horas Esperadas": row.expectedFormatted,
      "Saldo (min)": row.varianceMinutes,
      Status: row.status,
      "Dias Justificados": row.justifiedDays,
      "Pend. Atestados": row.pendingCertificates,
      "Pend. Abonos": row.pendingAbsences
    }));

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Resumo");
    summarySheet.columns = [
      { header: "Indicador", key: "Indicador", width: 24 },
      { header: "Valor", key: "Valor", width: 32 }
    ];
    summarySheet.addRows(summaryRows);

    const detailsSheet = workbook.addWorksheet("Espelho");
    detailsSheet.columns = Object.keys(detailRows[0] ?? {}).map((header, index) => ({
      header,
      key: header,
      width: [24, 18, 20, 18, 18, 12, 12, 16, 14, 14][index] ?? 16
    }));
    detailsSheet.addRows(detailRows);

    for (const sheet of [summarySheet, detailsSheet]) {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF137FEC" }
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadMirrorPdfFile = async (
    filename: string,
    title: string,
    rows: ReportRow[]
  ) => {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable")
    ]);
    const autoTable = autoTableModule.default;

    const totalMinutes = rows.reduce((sum, row) => sum + row.totalMinutes, 0);
    const expectedMinutes = rows.reduce((sum, row) => sum + row.expectedMinutes, 0);
    const saldoMinutes = rows.reduce((sum, row) => sum + row.varianceMinutes, 0);
    const generatedAt = new Date().toLocaleString("pt-BR");

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4"
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, 40, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Periodo: ${capitalizedDate}`, 40, 58);
    doc.text(`Gerado em: ${generatedAt}`, 40, 72);

    doc.setFontSize(11);
    doc.text(`Horas Trabalhadas: ${formatMinutes(totalMinutes)}`, 40, 95);
    doc.text(`Horas Esperadas: ${formatMinutes(expectedMinutes)}`, 270, 95);
    doc.text(`Saldo Total: ${saldoMinutes} min`, 500, 95);

    autoTable(doc, {
      startY: 112,
      margin: { left: 24, right: 24 },
      head: [
        [
          "Colaborador",
          "Departamento",
          "Cargo",
          "Trab.",
          "Esperado",
          "Saldo (min)",
          "Status",
          "Dias Just.",
          "Pend. Atest.",
          "Pend. Abon."
        ]
      ],
      body: rows.map((row) => [
        row.name,
        row.dept,
        row.role,
        row.hoursFormatted,
        row.expectedFormatted,
        String(row.varianceMinutes),
        row.status,
        String(row.justifiedDays),
        String(row.pendingCertificates),
        String(row.pendingAbsences)
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: [19, 127, 236],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    doc.save(`${filename}.pdf`);
  };

  const handleCreateReport = async () => {
    if (!reportName.trim()) {
      setReportFeedback("Informe um nome para o relatorio.");
      return;
    }

    if (filteredData.length === 0) {
      setReportFeedback("Sem dados no filtro atual para gerar o relatorio.");
      return;
    }

    const sanitizedName = reportName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_");
    const baseFileName = `${sanitizedName}_${new Date().toISOString().slice(0, 10)}`;

    setIsGeneratingReport(true);
    try {
      if (reportFormat === "CSV") {
        downloadCsvFile(`${baseFileName}.csv`, buildMirrorCsv(filteredData));
        setReportFeedback(`Relatorio "${reportName}" gerado em CSV (compativel com Excel).`);
        setShowCreateModal(false);
        setReportName("");
        setSelectedTemplateId(null);
        return;
      }

      if (reportFormat === "XLSX") {
        await downloadXlsxFile(baseFileName, reportName, filteredData);
        setShowCreateModal(false);
        setReportName("");
        setSelectedTemplateId(null);
        setReportFeedback(`Relatorio "${reportName}" gerado em XLSX.`);
        return;
      }

      await downloadMirrorPdfFile(baseFileName, reportName, filteredData);
      setShowCreateModal(false);
      setReportName("");
      setSelectedTemplateId(null);
      setReportFeedback(`Relatorio "${reportName}" gerado em PDF.`);
    } catch {
      setReportFeedback("Nao foi possivel gerar o PDF agora. Tente novamente.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      setReportFeedback("Sem dados no filtro atual para exportacao.");
      return;
    }
    downloadCsvFile(
      `espelho_ponto_${period.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
      buildMirrorCsv(filteredData)
    );
    setReportFeedback(`Exportacao CSV oficial concluida para ${capitalizedDate}.`);
  };

  const handleDateSelectorHint = () => {
    setReportFeedback("Selecao detalhada de data ainda nao implementada nesta tela.");
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark pb-24 font-display" data-testid="dashboard-page">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background-light dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h2 className="text-slate-900 dark:text-white text-xl font-bold leading-tight tracking-[-0.015em]">
            Relatorios
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/notificacoes")}
            title="Notificacoes"
            className="relative flex items-center justify-center h-10 w-10 rounded-full bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-100 hover:text-primary dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">notifications</span>
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>
          <button
            onClick={handleExportCSV}
            title="Exportar CSV"
            data-testid="dashboard-export-csv-button"
            className="flex items-center justify-center gap-1 h-10 rounded-full bg-blue-50 px-3 dark:bg-slate-800 text-primary hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">download</span>
            <span className="text-xs font-bold uppercase">CSV</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-4">
          <div
            onClick={handleDateSelectorHint}
            data-testid="dashboard-date-trigger"
            className="flex items-center gap-2 cursor-pointer group select-none"
          >
            <h2 className="text-slate-900 dark:text-white text-[24px] font-extrabold leading-tight group-hover:text-primary transition-colors">
              {capitalizedDate}
            </h2>
            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors mt-1 text-2xl">
              expand_more
            </span>
          </div>

          <div className="flex h-9 shrink-0 items-center rounded-lg bg-slate-200 p-1 dark:bg-slate-800">
            <button
              aria-label="Periodo mensal"
              onClick={() => setPeriod("Mes")}
              data-testid="dashboard-period-month"
              className={`px-3 h-7 rounded-md text-xs font-bold transition-all ${
                period === "Mes"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Mês
            </button>
            <button
              aria-label="Periodo semanal"
              onClick={() => setPeriod("Semana")}
              data-testid="dashboard-period-week"
              className={`px-3 h-7 rounded-md text-xs font-bold transition-all ${
                period === "Semana"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Semana
            </button>
          </div>
        </div>

        {reportFeedback && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
              {reportFeedback}
            </div>
          </div>
        )}

        {isLoadingData && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Atualizando dados reais de relatorio...
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 px-4 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => applyMetricFilter("ALL")}
            className={`flex flex-col gap-3 rounded-2xl p-4 bg-white dark:bg-surface-dark shadow-sm border transition-colors text-left ${
              metricFilter === "ALL"
                ? "border-primary/60 ring-1 ring-primary/20"
                : "border-slate-100 dark:border-slate-800 hover:border-primary/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined filled">schedule</span>
              </div>
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                <span className="material-symbols-outlined text-[12px]">trending_up</span>
                {stats.trend}
              </span>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Total Horas</p>
              <p className="text-[11px] font-semibold text-slate-400">Total Hours</p>
              <p className="text-slate-900 dark:text-white text-2xl font-bold mt-1">{stats.total}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyMetricFilter("OVERTIME")}
            className={`flex flex-col gap-3 rounded-2xl p-4 bg-white dark:bg-surface-dark shadow-sm border transition-colors text-left ${
              metricFilter === "OVERTIME"
                ? "border-orange-400/60 ring-1 ring-orange-300/40"
                : "border-slate-100 dark:border-slate-800 hover:border-orange-300/40"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-500">
                <span className="material-symbols-outlined">history_toggle_off</span>
              </div>
              <span className="flex items-center gap-1 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                Alertas
              </span>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Hora Extra</p>
              <p className="text-[11px] font-semibold text-slate-400">Overtime</p>
              <p className="text-slate-900 dark:text-white text-2xl font-bold mt-1">{stats.overtime}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyMetricFilter("ABSENT")}
            className={`flex flex-col gap-3 rounded-2xl p-4 bg-white dark:bg-surface-dark shadow-sm border transition-colors text-left ${
              metricFilter === "ABSENT"
                ? "border-rose-400/60 ring-1 ring-rose-300/40"
                : "border-slate-100 dark:border-slate-800 hover:border-rose-300/40"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500">
                <span className="material-symbols-outlined">person_off</span>
              </div>
              <span className="flex items-center gap-1 text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                Acao
              </span>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Faltas</p>
              <p className="text-[11px] font-semibold text-slate-400">Absences</p>
              <p className="text-slate-900 dark:text-white text-2xl font-bold mt-1">{stats.absences}</p>
            </div>
          </button>
        </div>

        <div className="px-4 pb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
              Tendencias (Filtro Atual)
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between h-40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase">Horas Extras</span>
                <span className="material-symbols-outlined text-orange-400 text-sm">trending_down</span>
              </div>
              <div className="flex items-end justify-between h-20 gap-2">
                {trendData.map((d, i) => (
                  <div key={i} className="flex flex-col items-center flex-1 group">
                    <div className="relative w-full rounded-t-sm bg-orange-100 dark:bg-orange-900/30 overflow-hidden flex items-end h-full">
                      <div
                        style={{ height: `${maxOvertime > 0 ? (d.overtime / maxOvertime) * 100 : 0}%` }}
                        className="w-full bg-orange-500 rounded-t-sm transition-all duration-500 group-hover:bg-orange-600"
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between h-40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase">Faltas</span>
                <span className="material-symbols-outlined text-rose-400 text-sm">trending_up</span>
              </div>
              <div className="flex items-end justify-between h-20 gap-2">
                {trendData.map((d, i) => (
                  <div key={i} className="flex flex-col items-center flex-1 group">
                    <div className="relative w-full rounded-t-sm bg-rose-100 dark:bg-rose-900/30 overflow-hidden flex items-end h-full">
                      <div
                        style={{ height: `${maxAbsence > 0 ? (d.absence / maxAbsence) * 100 : 0}%` }}
                        className="w-full bg-rose-500 rounded-t-sm transition-all duration-500 group-hover:bg-rose-600"
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
              Relatorios Profissionais
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {reportTemplates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-surface-dark"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">{template.icon}</span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{template.title}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {template.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {template.audience}
                  </span>
                  <button
                    onClick={() => handleCreateTemplateReport(template)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600"
                  >
                    Gerar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
              Radar Operacional
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                Em dia
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-200">
                {operationalMetrics.onTrack}
              </p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 dark:border-orange-900/40 dark:bg-orange-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-300">
                Atrasos
              </p>
              <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-200">
                {operationalMetrics.delayed}
              </p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                Pend. Atestado
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-200">
                {operationalMetrics.pendingCertificates}
              </p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                Abonos no mes
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-200">
                {operationalMetrics.absenceAdjustments}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 bg-background-light dark:bg-background-dark z-10 pb-4">
          <div className="relative mb-4 group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">search</span>
            </div>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="dashboard-search-input"
              className="block w-full pl-10 pr-3 py-3 rounded-xl border-none bg-white dark:bg-surface-dark text-slate-900 dark:text-white placeholder-slate-400 shadow-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all"
              placeholder="Buscar colaborador..."
              type="text"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setDeptFilter(dept)}
                data-testid={`dashboard-department-filter-${dept.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  deptFilter === dept
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "bg-white dark:bg-surface-dark text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        <div ref={employeeListRef} className="px-4 flex flex-col gap-3">
          {metricFilter !== "ALL" && (
            <div className="mb-1 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span>Filtro rapido ativo: {metricFilterLabel}</span>
              <button
                onClick={() => setMetricFilter("ALL")}
                className="rounded-lg px-2 py-1 text-primary hover:bg-blue-50 dark:hover:bg-slate-700"
              >
                Limpar
              </button>
            </div>
          )}

          {visibleRows.length > 0 ? (
            visibleRows.map((emp) => {
              let statusColorClass = "text-emerald-600 dark:text-emerald-400";
              let barColorClass = "bg-primary";
              let barBgClass = "bg-blue-100 dark:bg-blue-900/30";

              if (emp.status === "Extra") {
                statusColorClass = "text-orange-500 dark:text-orange-400";
                barColorClass = "bg-orange-500";
                barBgClass = "bg-orange-100 dark:bg-orange-900/30";
              } else if (emp.status === "Ausente" || emp.status === "Atraso") {
                statusColorClass = "text-rose-500 dark:text-rose-400";
                barColorClass = "bg-rose-500";
                barBgClass = "bg-rose-100 dark:bg-rose-900/30";
              }

              return (
                <div
                  key={emp.id}
                  className={`bg-white dark:bg-surface-dark rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-3 transition-transform active:scale-[0.99] ${
                    emp.status === "Ausente" ? "opacity-80" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`relative h-11 w-11 rounded-full overflow-hidden bg-slate-200 ring-2 ring-white dark:ring-slate-700 ${
                          emp.status === "Ausente" ? "grayscale" : ""
                        }`}
                      >
                        <img alt={emp.name} className="h-full w-full object-cover" src={emp.avatar} />
                        {emp.status !== "Ausente" && (
                          <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-surface-dark"></div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-bold text-base leading-none">
                          {emp.name}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">{emp.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-lg leading-none ${statusColorClass}`}>{emp.hoursFormatted}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-wide mt-1 ${statusColorClass}`}>
                        {emp.status}
                      </p>
                    </div>
                  </div>
                  <div className={`w-full ${barBgClass} rounded-full h-1.5 mt-1`}>
                    <div className={`${barColorClass} h-1.5 rounded-full`} style={{ width: `${emp.progress}%` }}></div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">filter_list_off</span>
              <p>Nenhum resultado.</p>
              <button
                onClick={() => {
                  setDeptFilter("Todos");
                  setSearchTerm("");
                  setMetricFilter("ALL");
                }}
                className="mt-2 text-primary font-bold text-sm"
              >
                Limpar Filtros
              </button>
            </div>
          )}
        </div>

        <div className="h-4"></div>
      </main>

      <div className="absolute bottom-[90px] right-4 z-20">
        <button
          onClick={() => {
            setSelectedTemplateId(null);
            setReportName("");
            setReportFormat("PDF");
            setShowCreateModal(true);
          }}
          data-testid="dashboard-open-report-modal"
          className="flex items-center justify-center size-14 rounded-full bg-primary text-white shadow-lg shadow-primary/40 hover:bg-blue-600 transition-transform transform hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined text-[28px]">add_chart</span>
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" data-testid="dashboard-report-modal-overlay">
          <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-zoom-in-95" data-testid="dashboard-report-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Novo Relatorio</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedTemplateId(null);
                }}
                data-testid="dashboard-report-modal-close"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {selectedTemplate && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                Template: {selectedTemplate.title}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Nome do Relatorio
              </label>
              <input
                type="text"
                data-testid="dashboard-report-name-input"
                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none text-slate-900 dark:text-white placeholder-slate-400"
                placeholder="ex: Resumo Outubro 2023"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Formato
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setReportFormat("PDF")}
                  data-testid="dashboard-report-format-pdf"
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-colors ${
                    reportFormat === "PDF"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">description</span>
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setReportFormat("CSV")}
                  data-testid="dashboard-report-format-csv"
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-colors ${
                    reportFormat === "CSV"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => setReportFormat("XLSX")}
                  data-testid="dashboard-report-format-xlsx"
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-colors ${
                    reportFormat === "XLSX"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">grid_on</span>
                  <span>XLSX</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedTemplateId(null);
                }}
                data-testid="dashboard-report-cancel-button"
                className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateReport()}
                disabled={isGeneratingReport}
                data-testid="dashboard-report-create-button"
                className="flex-1 py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-95 transition-all text-sm disabled:opacity-70"
              >
                {isGeneratingReport ? "Gerando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
