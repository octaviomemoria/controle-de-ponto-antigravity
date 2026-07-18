# Environments

## Objetivo
Concentrar a configuracao minima dos ambientes do projeto e os secrets esperados em GitHub e no provedor.

## Ambientes recomendados
- `staging`
- `production`

## Vercel
Configure as variaveis em `Settings > Environment Variables`, separando
Preview e Production. O push em `main` pode publicar Production pela integracao
GitHub da Vercel.

## Variaveis do backend por ambiente
- `NODE_ENV=production`
- `PORT=3002`
- `APP_URL=<dominio-do-ambiente>`
- `CORS_ALLOWED_ORIGINS=<origens-permitidas>`
- `SUPABASE_URL=<url-do-projeto-supabase>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
- `SUPABASE_ANON_KEY=<anon-key>`
- `TRUST_PROXY=true` ou equivalente
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=120`
- `ADMIN_RATE_LIMIT_WINDOW_MS=600000`
- `ADMIN_RATE_LIMIT_MAX=20`
- `STRIPE_ENABLED=false` ate concluir a configuracao
- `STRIPE_SECRET_KEY=<restricted-ou-secret-key>`
- `STRIPE_WEBHOOK_SECRET=<webhook-signing-secret>`
- `STRIPE_PRICE_IDS=<price_mensal,price_anual>`

## Variaveis do frontend por ambiente
- `VITE_SUPABASE_URL=<url-do-projeto-supabase>`
- `VITE_SUPABASE_ANON_KEY=<anon-key>`
- `VITE_ENABLE_DEMO_MODE=false`

## Diferenças entre staging e production
### `staging`
- pode usar subdominio interno ou temporario
- base de dados separada de producao
- usuarios e arquivos nao devem ser compartilhados com producao
- pode ter menor restricao de acesso externo, mas CORS deve continuar especifico

### `production`
- dominio final
- aprovacao manual para deploy
- rollback definido
- monitoramento e alertas obrigatorios

## Ordem de configuracao recomendada
1. Criar projeto Supabase de `staging`.
2. Aplicar `schema.sql` e `rls.sql` ou as migrations necessarias.
3. Criar buckets.
4. Configurar runtime de `staging`.
5. Validar deploy de `staging`.
6. Repetir o processo em `production`.
7. Habilitar workflow manual de promocao.

## Artefatos relacionados
- `DOCUMENTACAO_PRODUCAO_2026-05-19.md`
- `DEPLOY_STAGING.md`
- `RUNBOOK_PRODUCAO.md`
- `.github/workflows/ci.yml`
- `.github/workflows/production-monitor.yml`
