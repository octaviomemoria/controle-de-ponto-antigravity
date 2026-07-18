# Documentacao de Producao - Controle de Ponto OM Way

Data: 2026-05-19

## Estado consolidado

Os planos antigos foram consolidados neste documento e descartados como artefatos de planejamento. A fonte atual de verdade passa a ser:

- `README.md`
- `ENVIRONMENTS.md`
- `DEPLOY_STAGING.md`
- `RUNBOOK_PRODUCAO.md`
- `MOBILE_WEB_STRATEGY.md`
- `supabase/schema.sql`
- `supabase/rls.sql`
- `supabase/migrations/`

## Implementado

- Build web oficial via Vite: `npm run build:web`.
- Verificacao oficial cross-platform via Node: `npm run verify`.
- Smoke test da API cross-platform: `npm run smoke:api`.
- API Express servindo frontend buildado e endpoints `/api/health`, `/api/ready`, `/api/info`.
- Dockerfile de producao com build multi-stage e healthcheck.
- CI em Linux executando `npm ci` e `npm run verify`.
- Workflows de deploy para staging e promocao manual para producao.
- Ambientes documentados para `staging` e `production`.
- Supabase com schema multi-tenant, RLS, Storage policies e migrations.
- Hardening da API: CORS por allowlist, headers de seguranca, rate limit, request id e logs estruturados.
- Provisionamento administrativo com validacao de payload e bloqueio de escalonamento por `MANAGER`.
- Papel `OWNER` formalizado como equivalente a `SUPER_ADMIN` no app, schema e migration de hardening.
- Fallback local/demo preservado apenas para desenvolvimento ou ambiente controlado.
- Scaffold mobile Capacitor em `apps/mobile` para Android e iOS.

## Validacao local

Comando oficial:

```bash
npm run verify
```

O comando executa:

1. Typecheck do frontend.
2. Build web.
3. Smoke test da API em `/api/health` e `/api/ready`.

Resultado desta consolidacao: `npm run verify` passou antes da troca dos scripts para Node. Reexecutar apos qualquer mudanca antes de deploy.

## Supabase

Aplicar em ambientes novos:

1. `supabase/schema.sql`
2. `supabase/rls.sql`
3. migrations em ordem cronologica:
   - `supabase/migrations/20260322_001_production_hardening.sql`
   - `supabase/migrations/20260324_001_add_owner_role.sql`
   - `supabase/migrations/20260519_001_owner_equivalence_hardening.sql`

Buckets obrigatorios:

- `company-logos`
- `employee-photos`
- `certificates`
- `punch-photos`

## Deploy

Fluxo recomendado:

1. `npm ci`
2. `npm run verify`
3. Build da imagem Docker.
4. Publicacao no GHCR pelo workflow `Deploy Staging`.
5. Homologacao em staging.
6. Promocao manual para production usando a mesma tag `sha-<commit>`.

## Variaveis obrigatorias em runtime

Backend:

- `NODE_ENV=production`
- `PORT`
- `APP_URL`
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRUST_PROXY`

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_DEMO_MODE=false`

## Pendencias operacionais fora do codigo

- Criar projetos Supabase separados para staging e production.
- Aplicar SQL e migrations em cada ambiente.
- Criar buckets de Storage em cada ambiente.
- Configurar secrets dos GitHub Environments.
- Conectar webhook real do provedor de deploy.
- Validar login, ponto, upload e cadastro em staging com usuarios reais.
- Gerar projetos nativos Android/iOS com `npx cap add` quando iniciar a fase nativa.

## Observacoes de risco

- `localStorage` ainda existe como fallback e cache local para modo demo/offline. Em producao, manter `VITE_ENABLE_DEMO_MODE=false` e Supabase configurado.
- O app mobile ainda e scaffold Capacitor; nao ha APK/AAB/IPA versionado no repo.
- A prova final de producao depende de staging real, Supabase real e Storage real.
