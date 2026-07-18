# Vercel

O repositório possui `Dockerfile.vercel`; a Vercel executará o frontend e a API
Express no mesmo domínio.

Configure em **Settings > Environment Variables**, para Production e Preview:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL` (URL pública da Vercel ou domínio)
- `CORS_ALLOWED_ORIGINS` (mesmo valor de `APP_URL`)
- `TRUST_PROXY=1`
- `STRIPE_ENABLED=true`
- `STRIPE_SECRET_KEY` (somente servidor)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_IDS` (IDs separados por vírgula)

No Stripe, crie o webhook:

`https://SEU-DOMINIO/api/stripe/webhook`

Eventos necessários:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Nunca use `VITE_` para chaves secretas.
