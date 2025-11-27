# 🕐 Sistema de Controle de Ponto Eletrônico Antigravity

Sistema completo de controle de ponto multi-empresa com suporte offline, PWA, captura de foto e geolocalização.

## 📋 Índice

- [Características](#características)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração do Supabase](#configuração-do-supabase)
- [Execução](#execução)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Tecnologias](#tecnologias)

## ✨ Características

### Funcionalidades Principais
- ✅ **Multi-empresa (Multi-tenant)** - Isolamento total de dados entre empresas
- 📱 **PWA** - Instalável no celular como aplicativo
- 📷 **Captura de Foto** - Foto obrigatória em cada registro de ponto
- 📍 **Geolocalização** - Coordenadas GPS de cada registro
- ⏰ **Timestamp do Servidor** - Impossível fraudar horário
- 🔒 **Segurança RLS** - Row Level Security do Supabase
- 📊 **Relatórios** - Espelho de ponto e dados para folha de pagamento
- 💾 **Offline First** - Funciona sem internet, sincroniza depois
- 🔄 **Sincronização Automática** - Registros offline sincronizados ao reconectar

### Tipos de Usuário
- **Funcionário** - Registra ponto e visualiza histórico próprio
- **Admin da Empresa** - Gerencia funcionários e acessa relatórios da empresa
- **Super Admin** - Visualiza todas as empresas

### Tipos de Registro
- Entrada (Clock In)
- Saída (Clock Out)
- Início de Intervalo (Break Start)
- Fim de Intervalo (Break End)

## 🏗️ Arquitetura

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │ ◄─────► │    Backend   │ ◄─────► │  Supabase   │
│   (PWA)     │  HTTPS  │   (FastAPI)  │   API   │  (Database) │
│  HTML/CSS/JS│         │    Python    │         │  Auth+RLS   │
└─────────────┘         └──────────────┘         └─────────────┘
      │
      │ IndexedDB
      │ (Offline)
      ▼
┌─────────────┐
│   Cache     │
│Service Worker│
└─────────────┘
```

## 📦 Pré-requisitos

### Backend
- Python 3.9 ou superior
- pip (gerenciador de pacotes Python)

### Frontend
- Navegador moderno com suporte a PWA
- Servidor HTTP (pode usar Python http.server ou npx serve)

### Supabase
- Conta no [Supabase](https://supabase.com) (gratuita)
- Projeto criado no Supabase

## 🚀 Instalação

### 1. Clonar/Baixar o Projeto

```bash
cd c:\Users\octav\octavio.memoria\Aplicativos\Controle_de_ponto
```

### 2. Configurar Backend

```bash
cd backend

# Criar ambiente virtual (recomendado)
python -m venv venv

# Ativar ambiente virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
# source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Copiar arquivo de exemplo e configurar
copy .env.example .env
```

Editar o arquivo `.env` com suas configurações do Supabase (ver próxima seção).

### 3. Configurar Frontend

```bash
cd ..\frontend

# Não há instalação necessária
# Apenas certifique-se que os arquivos estão no local correto
```

## 🔧 Configuração do Supabase

### 1. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie uma conta (se não tiver)
3. Clique em "New Project"
4. Anote a **URL do Projeto** e as **API Keys**

### 2. Executar Schema SQL

1. No painel do Supabase, vá em **SQL Editor**
2. Clique em "New Query"
3. Copie todo o conteúdo do arquivo `backend/supabase_schema.sql`
4. Cole no editor e clique em **Run**

Isso criará:
- Todas as tabelas (empresas, perfis, registros_ponto)
- Políticas RLS para isolamento multi-tenant
- Bucket de storage para fotos
- Functions e views auxiliares

### 3. Criar Bucket de Storage

1. Vá em **Storage** no painel lateral
2. Verifique se o bucket `fotos-ponto` foi criado
3. Se não foi, crie manualmente:
   - Nome: `fotos-ponto`
   - Público: ✅ Sim

### 4. Configurar Autenticação

1. Vá em **Authentication** > **Providers**
2. Habilite **Email** provider
3. Desabilite "Confirm email" se for ambiente de desenvolvimento
4. (Opcional) Configure providers adicionais (Google, etc.)

### 5. Obter Credenciais

1. Vá em **Settings** > **API**
2. Copie:
   - **Project URL**: `https://SEU_PROJETO.supabase.co`
   - **anon public**: chave pública (para frontend)
   - **service_role**: chave privada (para backend)

### 6. Configurar .env do Backend

Edite `backend/.env`:

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-chave-publica-anon
SUPABASE_SERVICE_KEY=sua-chave-privada-service-role

API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True

ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

### 7. Criar Primeiro Usuário (Super Admin)

Como o sistema usa Supabase Auth, você precisa criar o primeiro usuário:

**Opção 1: Pelo painel do Supabase**
1. Vá em **Authentication** > **Users**
2. Clique em "Add User"
3. Preencha email e senha
4. Após criar, vá em **Table Editor** > **perfis**
5. Adicione manualmente um registro:
   - `id`: (mesmo UUID do usuário criado)
   - `empresa_id`: (UUID de uma empresa)
   - `email`: mesmo email
   - `nome_completo`: Seu Nome
   - `funcao`: `super_admin`

**Opção 2: Via API** (após backend rodando)
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_SUPER_ADMIN" \
  -d '{
    "email": "admin@empresa.com",
    "password": "senha123",
    "full_name": "Admin Sistema",
    "company_id": "UUID_DA_EMPRESA",
    "role": "super_admin"
  }'
```

## ▶️ Execução

### 1. Iniciar Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

O backend estará disponível em: `http://localhost:8000`
Documentação da API: `http://localhost:8000/docs`

### 2. Iniciar Frontend

Em outro terminal:

```bash
cd frontend

# Opção 1: Python http.server
python -m http.server 8080

# Opção 2: npx serve
npx serve -p 8080
```

O frontend estará disponível em: `http://localhost:8080`

### 3. Acessar o Sistema

1. Abra o navegador em `http://localhost:8080`
2. Faça login com o usuário criado
3. Permita acesso à câmera e localização quando solicitado

## 📁 Estrutura do Projeto

```
Controle_de_ponto/
├── backend/
│   ├── app/
│   │   ├── routers/          # Endpoints da API
│   │   │   ├── auth.py       # Autenticação
│   │   │   ├── ponto.py      # Registro de ponto
│   │   │   ├── relatorios.py # Relatórios
│   │   │   └── admin.py      # Administração
│   │   ├── services/         # Lógica de negócio
│   │   │   ├── clock_service.py    # Serviço de ponto
│   │   │   ├── photo_service.py    # Upload de fotos
│   │   │   ├── relatorio_service.py # Relatórios
│   │   │   └── folha_service.py    # Folha de pagamento
│   │   ├── models/           # Schemas e enums
│   │   ├── config.py         # Configurações
│   │   ├── dependencies.py   # Dependências FastAPI
│   │   ├── supabase_client.py # Cliente Supabase
│   │   └── main.py           # Aplicação principal
│   ├── requirements.txt
│   ├── supabase_schema.sql   # Schema completo
│   └── .env.example
│
└── frontend/
    ├── index.html            # Página principal
    ├── manifest.json         # Configuração PWA
    ├── service-worker.js     # Service Worker
    ├── css/
    │   ├── main.css          # Estilos principais
    │   └── ponto.css         # Estilos de ponto
    └── js/
        ├── config.js         # Configurações
        ├── api.js            # Cliente API
        ├── auth.js           # Autenticação
        ├── camera.js         # Captura de foto
        ├── geolocation.js    # Geolocalização
        ├── offline.js        # IndexedDB e sync
        ├── ponto.js          # Lógica de ponto
        ├── ui.js             # Interface
        └── app.js            # App principal
```

## 🛠️ Tecnologias

### Backend
- **FastAPI** - Framework web moderno e rápido
- **Supabase Python Client** - Cliente oficial do Supabase
- **Pydantic** - Validação de dados
- **Uvicorn** - Servidor ASGI

### Frontend
- **HTML5** - Estrutura semântica
- **CSS3** - Design moderno e responsivo
- **Vanilla JavaScript** - Sem frameworks
- **Service Worker** - Cache e offline
- **IndexedDB** - Armazenamento local
- **getUserMedia** - Acesso à câmera
- **Geolocation API** - GPS

### Infraestrutura
- **Supabase** - Backend as a Service
  - PostgreSQL - Banco de dados
  - PostgREST - API automática
  - Row Level Security - Segurança de dados
  - Storage - Armazenamento de arquivos
  - Auth - Autenticação

## 📱 Instalando como PWA

### Android
1. Abra o site no Chrome
2. Toque no menu (3 pontos)
3. Selecione "Adicionar à tela inicial"

### iOS
1. Abra o site no Safari
2. Toque no botão de compartilhar
3. Selecione "Adicionar à Tela de Início"

## 🔒 Segurança

- ✅ Autenticação via JWT (Supabase Auth)
- ✅ Row Level Security (RLS) no Supabase
- ✅ Senhas criptografadas
- ✅ HTTPS obrigatório em produção
- ✅ Timestamp do servidor (não do cliente)
- ✅ Validação de sequências de ponto
- ✅ Isolamento multi-tenant

## 📊 Relatórios Disponíveis

- **Espelho de Ponto** - Registros do funcionário por período
- **Folha de Pagamento** - Horas, extras, atrasos e faltas
- **Registros da Empresa** - Todos os registros (admin)
- **Exportação CSV** - Dados para sistemas de folha

## 🤝 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do backend e frontend (console do navegador)
2. Confirme que o Supabase está configurado corretamente
3. Verifique as permissões de câmera e localização

## 📝 Licença

Este projeto é de código aberto e está disponível sob a licença MIT.

---

**Desenvolvido em Português 🇧🇷**
