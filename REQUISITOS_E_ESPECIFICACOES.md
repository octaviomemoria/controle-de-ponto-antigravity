# Requisitos e Especificacoes (Base Atual) - Controle de Ponto OM Way
Data: 2026-02-11

**Objetivo deste documento**
Este arquivo descreve o que ja existe no sistema, como esta organizado e quais limitacoes atuais existem. Use este contexto para propor novas funcionalidades sem repetir o que ja foi implementado.

**Visao geral do sistema**
Portal do Colaborador para controle de ponto e gestao de pessoas, com foco em uso mobile, registro de ponto com foto e geolocalizacao, historico de registros, atestados e fluxo de gestores. O projeto e multi-tenant no banco (Supabase) e tem controle de acesso por roles.

**Arquitetura e stack**
- Monorepo Node com workspaces.
- Frontend em `apps/web`: React + TypeScript + Tailwind, build via script PowerShell com esbuild, PWA (service worker e manifest).
- Backend em `apps/api`: Express simples, serve o `dist` do web e endpoints de health/info.
- Banco planejado em Supabase (auth, Postgres, Storage) com schema e RLS prontos.
- Ambiente: usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

**Perfis de usuario (roles)**
- EMPLOYEE: acesso a home, ponto, historico, atestados, perfil.
- LEADER: acesso a equipe, historico de colaboradores do seu departamento, abonos e aprovacao de atestados (via telas).
- MANAGER: acesso a gestao de colaboradores, configuracoes da empresa, relatorios e aprovacoes.
- SUPER_ADMIN: acesso ao dashboard global de empresas e usuarios.

**Funcionalidades implementadas no frontend (apps/web)**
- Autenticacao: login com Supabase (quando configurado) e modo demo por role (quando Supabase nao esta configurado).
- Home do colaborador: status online/offline, proxima acao (entrada/saida), resumo de horas do dia, acesso rapido a atestados.
- Registro de ponto: captura de foto via camera, geolocalizacao, hash SHA-256 de integridade, armazenamento local e modo offline com status PENDING/SYNCED.
- Historico: filtros por mes, resumo de horas e lista de atividades (pontos, pausas, atestados, abonos).
- Atestados: envio de atestado com foto ou PDF, validacao basica de arquivo, historico recente.
- Abono de falta: registro de justificativa por lider/gestor.
- Equipe/Gestao: lista de colaboradores, busca, filtros, status, cadastro de novo colaborador (local).
- Detalhes do colaborador: edicao de dados, troca de foto, contato rapido, aprovacao de atestados pendentes, historico recente.
- Configuracoes da empresa: modo de registro (SIMPLE/FULL), jornada diaria e tolerancia (salvos localmente).
- Relatorios: dashboard com dados simulados, exportacao CSV e criacao de relatorio (simulado).
- Super Admin: gestao de empresas (mock), troca de modo de ponto por empresa, gestao de usuarios (mock).
- Perfil: dados pessoais, preferencias, tema claro/escuro (local).
- PWA: cache basico do shell via service worker.

**Fluxos principais (UI)**
- Login -> Home -> Registrar Ponto -> Success -> Historico.
- Gestor/Lider -> Equipe -> Detalhe do colaborador -> Abono/Atestados.
- Gestor -> Configuracoes da Empresa -> salvar preferencias.
- Gestor -> Relatorios -> exportar CSV.
- Super Admin -> Home/Empresas/Usuarios.

**Persistencia local atual (modo demo)**
- LocalStorage e usado como fonte de dados.
- Chaves principais:
- `portal.demo.role`
- `portal.time_entries`
- `portal.lastPunch`
- `portal.certificates`
- `portal.custom_employees`
- `portal.company.mode`
- `portal.company.workHours`
- `portal.company.tolerance`
- `portal.profile.<userId>`
- `theme`
- Estrutura basica de entrada de ponto (local): `id`, `userId`, `type`, `timestamp`, `location`, `coordinates`, `photoUrl`, `status`, `hash`, `deviceInfo`, `source`.

**Backend atual (apps/api)**
- Endpoints prontos: `GET /api/health` e `GET /api/info`.
- Sem endpoints de negocio implementados ainda.
- Serve arquivos estaticos do frontend em producao.

**Banco de dados (Supabase)**
- Tabelas principais: `companies`, `departments`, `profiles`, `company_settings`, `geofences`, `time_entries`, `certificates`, `absence_justifications`, `invitations`, `audit_logs`.
- Enums: `user_role`, `company_status`, `time_entry_type`, `time_entry_status`, `certificate_status`, `tracking_mode`.
- Funcoes helper: `current_company_id`, `current_user_role`, `current_department_id`, `is_super_admin`.
- Trigger de criacao de profile ao criar usuario no Supabase.

**Seguranca e permissao (RLS no Supabase)**
- Leitura limitada por empresa e role.
- EMPLOYEE: ve seus proprios registros.
- LEADER: ve sua equipe (mesmo departamento).
- MANAGER: ve todos da empresa.
- SUPER_ADMIN: acesso global.
- Escrita em `time_entries`, `certificates` e `absence_justifications` controlada por role e company.

**Storage (Supabase)**
- Buckets planejados: `company-logos`, `employee-photos`, `certificates`, `punch-photos`.

**Limitacoes e gaps atuais**
- Frontend usa dados mock e localStorage; integracao real com Supabase ainda nao feita.
- Nao existe sincronizacao offline -> online implementada no backend.
- Nao existem notificacoes reais (push/email).
- Relatorios e dashboards usam dados simulados.
- Geofencing existe no schema, mas nao foi integrado na UI.
- Convites de usuarios e audit logs existem no schema, mas sem UI/fluxo.

**Requisitos nao funcionais (base atual)**
- Uso mobile first e PWA (cache basico).
- Registro de ponto com foto e GPS.
- Controle por roles e RLS no banco (quando integrado).
- Suporte a modo offline (com armazenamento local).

**Pedido para o ChatGPT (pesquisa de novas funcionalidades)**
Considerar este estado atual e sugerir novas funcionalidades que agreguem valor ao controle de ponto e gestao de pessoas, evitando repetir o que ja existe. Priorizar ideias que aproveitem o schema do Supabase e que possam evoluir do modo demo para producao.
