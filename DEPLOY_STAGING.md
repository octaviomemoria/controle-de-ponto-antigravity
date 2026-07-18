# Deploy Preview na Vercel

## Objetivo
Homologar cada branch em Preview antes de promover `main`.

## Fluxo
1. Conectar o repositorio na Vercel.
2. A Vercel detecta `Dockerfile.vercel`.
3. Configurar variaveis de Preview com Supabase separado.
4. Abrir PR e validar a URL de Preview.
5. Fazer merge em `main` para Production.

## Promocao para producao
Promova somente o commit homologado fazendo merge em `main`. Mantenha o CI
obrigatorio e habilite protecao da branch no GitHub.

## Variaveis de ambiente esperadas no runtime de staging
- `NODE_ENV=production`
- `PORT=3002`
- `APP_URL=https://<dominio-staging>`
- `CORS_ALLOWED_ORIGINS=https://<dominio-staging>`
- `SUPABASE_URL=<url-do-projeto-staging>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-do-staging>`
- `TRUST_PROXY=true` ou valor compativel com o provedor
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=120`
- `ADMIN_RATE_LIMIT_WINDOW_MS=600000`
- `ADMIN_RATE_LIMIT_MAX=20`

## Variaveis do frontend em staging
- `VITE_SUPABASE_URL=<url-do-projeto-staging>`
- `VITE_SUPABASE_ANON_KEY=<anon-key-do-staging>`
- `VITE_ENABLE_DEMO_MODE=false`

## Passos para conectar ao provedor real
Consulte `VERCEL_SETUP.md` para variaveis e webhook Stripe.

## Checklist antes do primeiro deploy de staging
- `npm run verify` local validado
- `Dockerfile.vercel` buildando sem erro no provedor
- projeto Supabase de staging criado
- migration `supabase/migrations/20260322_001_production_hardening.sql` aplicada
- buckets criados:
  - `company-logos`
  - `employee-photos`
  - `certificates`
  - `punch-photos`
- `APP_URL` e `CORS_ALLOWED_ORIGINS` apontando para o dominio correto
- `VITE_ENABLE_DEMO_MODE=false`
- fluxo `/api/health` e `/api/ready` testado no ambiente

## Primeiro teste recomendado apos subir staging
1. Abrir `/api/health`.
2. Abrir `/api/ready`.
3. Validar login com usuario real.
4. Validar upload de foto de perfil.
5. Validar upload de atestado.
6. Validar registro de ponto com foto.
7. Validar cadastro de colaborador por `MANAGER`.
8. Confirmar que `MANAGER` nao consegue criar `SUPER_ADMIN`.
