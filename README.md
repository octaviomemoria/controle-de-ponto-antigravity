# Controle de Ponto Antigravity

Estrutura inicial full‑stack:

- `apps/web` → React + TypeScript + Tailwind + PWA (build via Vite)
- `apps/api` → Express (API)
- `apps/desktop` → Electron para Windows (instalador NSIS e portatil)

## Estrategia de plataformas

Uso recomendado por canal:
- `Web`: administradores e owner/super admin
- `Mobile Android`: colaborador e lideranca operacional
- `Mobile iOS`: colaborador e lideranca operacional

Observacoes:
- Hoje o repositorio contem o canal `web` e a API.
- Para Android e iOS, a recomendacao e empacotar o frontend em um container mobile multiplataforma, preferencialmente `Capacitor`.
- O papel `OWNER` existe no schema como equivalente funcional de `SUPER_ADMIN`. Ambos tem acesso administrativo completo.

## Como iniciar (dev)

```bash
npm install
npm run dev
```

Frontend: `http://localhost:3002`
API: `http://localhost:3002/api/health`
Readiness: `http://localhost:3002/api/ready`

## Deploy na Vercel

O projeto usa `Dockerfile.vercel` para servir React e API Express no mesmo
dominio. Veja `VERCEL_SETUP.md`.

## Banco de dados (Supabase)

Scripts SQL:
- `supabase/schema.sql` (tabelas, enums, indices, triggers)
- `supabase/rls.sql` (Row Level Security)

Fluxo sugerido:
1. Criar projeto no Supabase.
2. Executar `schema.sql` no SQL Editor.
3. Executar `rls.sql` logo em seguida.
4. Para migracoes, executar scripts em `supabase/migrations/`.
5. Configurar buckets de Storage:
   - `company-logos`
   - `employee-photos`
   - `certificates`
   - `punch-photos`
6. Copiar `apps/web/.env.example` para `apps/web/.env`.
7. Definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no frontend.
8. Manter `VITE_ENABLE_DEMO_MODE=false` em producao. Habilite `true` apenas em ambiente controlado.
9. Copiar `apps/api/.env.example` para `.env` na raiz ou configurar as variaveis do backend no ambiente.
10. Em producao, definir `CORS_ALLOWED_ORIGINS` com os dominios permitidos do app.

## Verificacao minima

```bash
npm run verify
```

O comando executa:
- typecheck do frontend
- build web
- smoke test da API em `/api/health`
- smoke test da API em `/api/ready`

## Documentacao operacional

- `DOCUMENTACAO_PRODUCAO_2026-05-19.md` - estado consolidado de producao.
- `ENVIRONMENTS.md` - variaveis e ambientes.
- `DEPLOY_STAGING.md` - publicacao da imagem e staging.
- `RUNBOOK_PRODUCAO.md` - validacao, rollback e incidente.
- `MOBILE_WEB_STRATEGY.md` - estrategia web/mobile.

## Mobile

Existe um scaffold inicial em `apps/mobile` para empacotar o frontend com Capacitor.

- os projetos nativos Android/iOS ainda devem ser criados localmente com `npx cap add`
- o repositorio ainda nao gera APK/AAB/IPA sozinho
- a base mobile atual e preparatoria, nao um pipeline nativo completo

## Desktop Windows

```bash
npm run build:desktop
```

Artefatos em `apps/desktop/release/`. Consulte `apps/desktop/README.md`.
