-- Schema principal para Controle de Ponto (multi-tenant)
-- Requer extensao pgcrypto para gen_random_uuid()
create extension if not exists "pgcrypto";

-- Enums
-- OWNER added as equivalent to SUPER_ADMIN for future formalization
-- SUPER_ADMIN remains for backward compatibility
do $$ begin
  create type user_role as enum ('EMPLOYEE', 'LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_status as enum ('ACTIVE', 'TRIAL', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_entry_type as enum (
    'CLOCK_IN',
    'CLOCK_OUT',
    'BREAK_START',
    'BREAK_END',
    'ABSENCE',
    'CERTIFICATE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_entry_status as enum ('PENDING', 'SYNCED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type certificate_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type absence_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tracking_mode as enum ('SIMPLE', 'FULL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type site_access_policy as enum ('ANY_SITE', 'ASSIGNED_ONLY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outside_area_policy as enum ('BLOCK_ALWAYS', 'ALLOW_WITH_JUSTIFICATION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type external_punch_type as enum ('HOME_OFFICE', 'EXTERNAL_VISIT', 'FIELD_SERVICE', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interval_type as enum ('LUNCH', 'DINNER', 'SNACK_AM', 'SNACK_PM');
exception when duplicate_object then null; end $$;

-- Tabelas core
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  status company_status not null default 'ACTIVE',
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  role user_role not null default 'EMPLOYEE',
  name text,
  email text,
  avatar_url text,
  pis text,
  status text default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  add column if not exists leader_id uuid references public.profiles(id) on delete set null;

alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true;
alter table public.profiles
  add column if not exists theme_preference text default 'light';
alter table public.profiles
  add column if not exists leader_id uuid references public.profiles(id) on delete set null;

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  time_tracking_mode tracking_mode not null default 'FULL',
  work_hours numeric(4,2) not null default 8,
  tolerance_minutes integer not null default 10,
  timezone text default 'America/Sao_Paulo',
  geofence_enabled boolean not null default false,
  geofence_radius integer default 0,
  site_access_policy site_access_policy not null default 'ASSIGNED_ONLY',
  outside_area_policy outside_area_policy not null default 'BLOCK_ALWAYS',
  external_punch_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.company_settings
  add column if not exists site_access_policy site_access_policy not null default 'ASSIGNED_ONLY';
alter table public.company_settings
  add column if not exists outside_area_policy outside_area_policy not null default 'BLOCK_ALWAYS';
alter table public.company_settings
  add column if not exists external_punch_enabled boolean not null default false;

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  timezone text default 'America/Sao_Paulo',
  shift_start text not null,
  shift_end text not null,
  default_tolerance_min integer not null default 10,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_intervals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.work_schedules(id) on delete cascade,
  type interval_type not null,
  window_start text not null,
  window_end text not null,
  duration_min integer not null,
  tolerance_min integer,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists schedule_id uuid references public.work_schedules(id) on delete set null;

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  lat numeric(10,6) not null,
  lng numeric(10,6) not null,
  radius_meters integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address_line text not null,
  city text,
  state text,
  postal_code text,
  country text default 'BR',
  lat numeric(10,6) not null,
  lng numeric(10,6) not null,
  radius_meters integer not null default 200,
  timezone text not null default 'America/Sao_Paulo',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid not null references public.company_sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, site_id)
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type time_entry_type not null,
  timestamp timestamptz not null,
  location_text text,
  coordinates jsonb,
  photo_url text,
  photo_path text,
  status time_entry_status not null default 'PENDING',
  hash_integrity text,
  device_info text,
  source text,
  site_id uuid references public.company_sites(id) on delete set null,
  outside_geofence boolean not null default false,
  external_punch boolean not null default false,
  external_type external_punch_type,
  external_note text,
  site_timezone text,
  interval_type interval_type,
  schedule_id uuid references public.work_schedules(id) on delete set null,
  schedule_interval_id uuid references public.work_intervals(id) on delete set null,
  schedule_violation boolean not null default false,
  schedule_note text,
  corrected_entry_id uuid references public.time_entries(id) on delete set null,
  correction_reason text,
  created_at timestamptz not null default now()
);

alter table public.time_entries
  add column if not exists corrected_entry_id uuid references public.time_entries(id) on delete set null;
alter table public.time_entries
  add column if not exists correction_reason text;
alter table public.time_entries
  add column if not exists photo_path text;
alter table public.time_entries
  add column if not exists site_id uuid references public.company_sites(id) on delete set null;
alter table public.time_entries
  add column if not exists outside_geofence boolean not null default false;
alter table public.time_entries
  add column if not exists external_punch boolean not null default false;
alter table public.time_entries
  add column if not exists external_type external_punch_type;
alter table public.time_entries
  add column if not exists external_note text;
alter table public.time_entries
  add column if not exists site_timezone text;
alter table public.time_entries
  add column if not exists interval_type interval_type;
alter table public.time_entries
  add column if not exists schedule_id uuid references public.work_schedules(id) on delete set null;
alter table public.time_entries
  add column if not exists schedule_interval_id uuid references public.work_intervals(id) on delete set null;
alter table public.time_entries
  add column if not exists schedule_violation boolean not null default false;
alter table public.time_entries
  add column if not exists schedule_note text;

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  description text,
  file_url text,
  file_path text,
  status certificate_status not null default 'PENDING',
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.certificates
  add column if not exists file_path text;

create table if not exists public.absence_justifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  reason text not null,
  description text,
  status absence_status not null default 'PENDING',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  sla_due_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.absence_justifications
  add column if not exists status absence_status not null default 'PENDING';
alter table public.absence_justifications
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.absence_justifications
  add column if not exists reviewed_at timestamptz;
alter table public.absence_justifications
  add column if not exists review_note text;
alter table public.absence_justifications
  add column if not exists sla_due_at timestamptz;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role user_role not null default 'EMPLOYEE',
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

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

-- Indices
create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_profiles_department on public.profiles(department_id);
create index if not exists idx_profiles_leader on public.profiles(leader_id);
create index if not exists idx_time_entries_company on public.time_entries(company_id);
create index if not exists idx_time_entries_user on public.time_entries(user_id);
create index if not exists idx_time_entries_timestamp on public.time_entries(timestamp);
create index if not exists idx_time_entries_site on public.time_entries(site_id);
create index if not exists idx_certificates_company on public.certificates(company_id);
create index if not exists idx_certificates_user on public.certificates(user_id);
create index if not exists idx_absence_company on public.absence_justifications(company_id);
create index if not exists idx_absence_user on public.absence_justifications(user_id);
create index if not exists idx_absence_status on public.absence_justifications(status);
create index if not exists idx_invitations_company on public.invitations(company_id);
create index if not exists idx_company_sites_company on public.company_sites(company_id);
create index if not exists idx_profile_sites_profile on public.profile_sites(profile_id);
create index if not exists idx_profile_sites_site on public.profile_sites(site_id);
create index if not exists idx_work_schedules_company on public.work_schedules(company_id);
create index if not exists idx_work_intervals_schedule on public.work_intervals(schedule_id);
create index if not exists idx_profiles_schedule on public.profiles(schedule_id);
create index if not exists idx_time_entries_schedule on public.time_entries(schedule_id);

-- Helper functions
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select department_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('OWNER', 'SUPER_ADMIN') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('OWNER', 'SUPER_ADMIN') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.can_manage_company(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_owner()
    or (
      public.current_user_role() = 'MANAGER'
      and target_company_id = public.current_company_id()
    )
$$;

create or replace function public.can_review_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_owner()
    or exists (
      select 1
      from public.profiles target
      where target.id = target_user_id
        and target.company_id = public.current_company_id()
        and (
          public.current_user_role() = 'MANAGER'
          or (
            public.current_user_role() = 'LEADER'
            and target.department_id = public.current_department_id()
          )
        )
    )
$$;

create or replace function public.storage_company_id(storage_path text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(storage_path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(storage_path, '/', 1)::uuid
    else null
  end
$$;

create or replace function public.storage_owner_id(storage_path text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(storage_path, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(storage_path, '/', 2)::uuid
    else null
  end
$$;

create or replace function public.can_access_user_file(storage_path text)
returns boolean
language sql
stable
as $$
  select
    public.is_owner()
    or (
      auth.uid() is not null
      and public.storage_company_id(storage_path) = public.current_company_id()
      and (
        public.storage_owner_id(storage_path) = auth.uid()
        or public.current_user_role() = 'MANAGER'
        or (
          public.current_user_role() = 'LEADER'
          and public.can_review_user(public.storage_owner_id(storage_path))
        )
      )
    )
$$;

-- Trigger opcional para criar profile ao cadastrar usuario no Supabase
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, company_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'EMPLOYEE'::public.user_role,
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
