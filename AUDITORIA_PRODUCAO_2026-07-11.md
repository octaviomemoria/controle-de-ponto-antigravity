# Auditoria para producao — 2026-07-11

## Veredito

Codigo local aprovado nas verificacoes automatizadas, mas o go-live ainda depende
de homologacao em infraestrutura real. Nao publicar antes dos bloqueios abaixo.

## Bloqueios externos

1. Aplicar `supabase/migrations/20260711_001_harden_new_user_role.sql` em staging e producao.
2. Confirmar RLS e buckets no Supabase real com contas de duas empresas distintas.
3. Configurar `SUPABASE_SERVICE_ROLE_KEY`, dominios/CORS, webhook de deploy e alertas.
4. Criar cinco contas reais de homologacao e validar email, reset de senha, uploads e ponto.
5. Assinar digitalmente o executavel Windows e adicionar icone oficial.
6. Fazer validacao juridica/LGPD e das regras trabalhistas aplicaveis antes do uso oficial.

## Bugs e riscos corrigidos

- Elevacao visual de perfil via `user_metadata.role`: frontend agora usa `profiles.role`/`app_metadata`.
- Trigger de novo usuario confiava em papel e empresa editaveis: agora cria somente `EMPLOYEE`, sem empresa.
- Paginas lazy abriam tela branca (React #426): rotas agora estao dentro de `Suspense`.
- Menu demo de Colaborador mostrava rotas proibidas: alinhado ao RBAC.
- Campos de login sem `autocomplete`: corrigidos.
- Dependencias de producao: 10 vulnerabilidades (1 critica) reduzidas para zero.
- `xlsx` vulneravel substituido por `exceljs`, mantendo exportacao XLSX.

## Testes executados

- `npm run verify`: typecheck, build web, health e readiness — passou.
- `npm audit --omit=dev`: zero vulnerabilidades — passou.
- Playwright, modo demo, tela protegida por perfil — passou:
  - EMPLOYEE: Historico
  - LEADER: Minha Equipe
  - MANAGER: Gestao
  - OWNER: Super Admin
  - SUPER_ADMIN: Super Admin
- Electron Windows: instalador NSIS e executavel portatil gerados — passou.

## Melhorias sugeridas

### P0 — antes do go-live

- Testes de integracao reais de RLS/multiempresa e Storage.
- Testes automatizados de API administrativa, login e recuperacao de senha.
- Observabilidade: erros frontend, uptime, alertas, logs centralizados e backups testados.
- Assinatura de codigo do desktop e gestao segura de atualizacoes.

### P1 — primeira versao

- Pipeline E2E no CI para todos os papeis.
- Reduzir bundle de ExcelJS (~939 kB) e retirar exportadores do precache PWA.
- Idempotencia e transacao compensatoria no cadastro de usuario/perfil.
- Rate limit compartilhado (Redis/provedor), pois o atual e por processo.
- Politica de retencao, exportacao e exclusao de dados pessoais.

### P2 — evolucao

- Aplicativos Android/iOS completos e pipeline de lojas.
- Atualizacao automatica do desktop, telemetria opt-in e modo offline com fila auditavel.
- Testes de carga, acessibilidade WCAG e navegadores/dispositivos suportados.

## Acessos de teste

O modo demo nao usa senha. Configure temporariamente `VITE_ENABLE_DEMO_MODE=true`
somente em localhost/staging controlado e escolha um dos cinco botoes da tela de login.
Em producao a flag deve permanecer `false`.

| Perfil | Nivel | Principais acessos |
|---|---:|---|
| Colaborador (`EMPLOYEE`) | 1 | Ponto, historico, atestados, perfil |
| Lider (`LEADER`) | 2 | Nivel 1 + equipe, revisoes e relatorios |
| Gestor (`MANAGER`) | 3 | Gestao da empresa, usuarios, configuracoes e auditoria |
| Proprietario (`OWNER`) | 4 | Administracao global, equivalente ao Super Admin |
| Super Admin (`SUPER_ADMIN`) | 4 | Administracao global legada |

Credenciais reais nao foram encontradas no repositorio e nao foram inventadas. A chave
administrativa do Supabase tambem nao esta configurada localmente; por isso nenhuma
conta real foi criada nesta auditoria.
