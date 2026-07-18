export type CompanySettings = {
  workHours: number;
  toleranceMinutes: number;
  timezone: string;
  timeTrackingMode: "SIMPLE" | "FULL";
};

export type MockCompany = {
  id: string;
  name: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  statusText: string;
  logoUrl?: string;
  employeeCount: number;
  totalPunches: string;
  settings: CompanySettings;
};

export const mockCompanies: MockCompany[] = [
  {
    id: "c01",
    name: "Grupo Orion",
    status: "ACTIVE",
    statusText: "Ativa",
    logoUrl: "",
    employeeCount: 142,
    totalPunches: "8.402",
    settings: {
      workHours: 8,
      toleranceMinutes: 10,
      timezone: "America/Sao_Paulo",
      timeTrackingMode: "FULL"
    }
  },
  {
    id: "c02",
    name: "Nova Atlas",
    status: "TRIAL",
    statusText: "Teste Iniciado",
    logoUrl: "",
    employeeCount: 38,
    totalPunches: "1.932",
    settings: {
      workHours: 8,
      toleranceMinutes: 5,
      timezone: "America/Sao_Paulo",
      timeTrackingMode: "SIMPLE"
    }
  },
  {
    id: "c03",
    name: "Avenida Norte",
    status: "ACTIVE",
    statusText: "Ativa",
    logoUrl: "",
    employeeCount: 210,
    totalPunches: "12.104",
    settings: {
      workHours: 8,
      toleranceMinutes: 15,
      timezone: "America/Sao_Paulo",
      timeTrackingMode: "FULL"
    }
  }
];
