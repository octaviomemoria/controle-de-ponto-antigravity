export type MockEmployee = {
  id: string;
  name: string;
  role: string;
  department: string;
  active: boolean;
  avatar: string;
  email: string;
  phone: string;
};

export const mockEmployees: MockEmployee[] = [
  // ── Demo ────────────────────────────────────────────────────────────────────
  {
    id: "demo",
    name: "Colaborador Demo",
    role: "Colaborador",
    department: "Operacoes",
    active: true,
    avatar: "https://ui-avatars.com/api/?name=Colaborador+Demo&background=137fec&color=fff",
    email: "demo@local",
    phone: "+55 (11) 90000-0000"
  },

  // ── Operações ────────────────────────────────────────────────────────────────
  {
    id: "e01",
    name: "Ana Souza",
    role: "Analista de Operacoes",
    department: "Operacoes",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=47",
    email: "ana.souza@empresa.com",
    phone: "+55 (11) 99888-1101"
  },
  {
    id: "e02",
    name: "Carlos Lima",
    role: "Lider de Campo",
    department: "Operacoes",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=12",
    email: "carlos.lima@empresa.com",
    phone: "+55 (11) 99888-1102"
  },
  {
    id: "e07",
    name: "Beatriz Ramos",
    role: "Operadora",
    department: "Operacoes",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=21",
    email: "beatriz.ramos@empresa.com",
    phone: "+55 (11) 99888-1107"
  },

  // ── Financeiro ───────────────────────────────────────────────────────────────
  {
    id: "e03",
    name: "Marina Dias",
    role: "Analista Financeiro",
    department: "Financeiro",
    active: false,
    avatar: "https://i.pravatar.cc/150?img=32",
    email: "marina.dias@empresa.com",
    phone: "+55 (11) 99888-1103"
  },
  {
    id: "e08",
    name: "Lucas Teixeira",
    role: "Assistente Financeiro",
    department: "Financeiro",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=33",
    email: "lucas.teixeira@empresa.com",
    phone: "+55 (11) 99888-1108"
  },

  // ── Suporte ──────────────────────────────────────────────────────────────────
  {
    id: "e04",
    name: "Joao Ferreira",
    role: "Tecnico de Suporte",
    department: "Suporte",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=15",
    email: "joao.ferreira@empresa.com",
    phone: "+55 (11) 99888-1104"
  },
  {
    id: "e09",
    name: "Patricia Moura",
    role: "Analista de Suporte",
    department: "Suporte",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=9",
    email: "patricia.moura@empresa.com",
    phone: "+55 (11) 99888-1109"
  },

  // ── RH ───────────────────────────────────────────────────────────────────────
  {
    id: "e05",
    name: "Julia Costa",
    role: "Coordenadora de RH",
    department: "RH",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=8",
    email: "julia.costa@empresa.com",
    phone: "+55 (11) 99888-1105"
  },
  {
    id: "e10",
    name: "Eduardo Nascimento",
    role: "Assistente de RH",
    department: "RH",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=60",
    email: "eduardo.nascimento@empresa.com",
    phone: "+55 (11) 99888-1110"
  },

  // ── Vendas ───────────────────────────────────────────────────────────────────
  {
    id: "e06",
    name: "Rafael Alves",
    role: "Supervisor Comercial",
    department: "Vendas",
    active: false,
    avatar: "https://i.pravatar.cc/150?img=54",
    email: "duplicate@example.com",
    phone: "+55 (11) 99888-1106"
  },
  {
    id: "e11",
    name: "Camila Borges",
    role: "Consultora de Vendas",
    department: "Vendas",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=5",
    email: "camila.borges@empresa.com",
    phone: "+55 (11) 99888-1111"
  },

  // ── TI ───────────────────────────────────────────────────────────────────────
  {
    id: "e12",
    name: "Andre Santos",
    role: "Desenvolvedor",
    department: "TI",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=11",
    email: "andre.santos@empresa.com",
    phone: "+55 (11) 99888-1112"
  },
  {
    id: "e13",
    name: "Fernanda Oliveira",
    role: "Analista de TI",
    department: "TI",
    active: true,
    avatar: "https://i.pravatar.cc/150?img=44",
    email: "fernanda.oliveira@empresa.com",
    phone: "+55 (11) 99888-1113"
  }
];
