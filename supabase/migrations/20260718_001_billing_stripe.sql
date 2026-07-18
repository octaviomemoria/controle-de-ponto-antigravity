create table if not exists public.billing_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

alter table public.billing_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "billing_subscriptions_read" on public.billing_subscriptions;
create policy "billing_subscriptions_read"
on public.billing_subscriptions
for select
using (
  company_id = public.current_company_id()
  and public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
);

-- No client write policies. Only the service role processes Stripe updates.
