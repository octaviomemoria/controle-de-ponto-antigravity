-- RLS Policies

alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.work_schedules enable row level security;
alter table public.work_intervals enable row level security;
alter table public.geofences enable row level security;
alter table public.company_sites enable row level security;
alter table public.profile_sites enable row level security;
alter table public.time_entries enable row level security;
alter table public.certificates enable row level security;
alter table public.absence_justifications enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- companies
drop policy if exists "companies_select" on public.companies;
create policy "companies_select"
on public.companies
for select
using (id = public.current_company_id() or public.is_super_admin());

drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert"
on public.companies
for insert
with check (public.is_super_admin());

drop policy if exists "companies_update" on public.companies;
create policy "companies_update"
on public.companies
for update
using (public.can_manage_company(id))
with check (public.can_manage_company(id));

-- departments
drop policy if exists "departments_read" on public.departments;
create policy "departments_read"
on public.departments
for select
using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists "departments_write" on public.departments;
create policy "departments_write"
on public.departments
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

-- profiles
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read"
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_super_admin()
  or (
    public.current_user_role() = 'MANAGER'
    and company_id = public.current_company_id()
  )
  or (
    public.current_user_role() = 'LEADER'
    and company_id = public.current_company_id()
    and department_id = public.current_department_id()
  )
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (
  id = auth.uid()
  or public.can_manage_company(company_id)
)
with check (
  (
    id = auth.uid()
    and company_id = public.current_company_id()
    and role::text = public.current_user_role()
  )
  or public.can_manage_company(company_id)
);

-- company settings
drop policy if exists "settings_read" on public.company_settings;
create policy "settings_read"
on public.company_settings
for select
using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists "settings_write" on public.company_settings;
create policy "settings_write"
on public.company_settings
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

-- work schedules
drop policy if exists "work_schedules_read" on public.work_schedules;
create policy "work_schedules_read"
on public.work_schedules
for select
using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists "work_schedules_write" on public.work_schedules;
create policy "work_schedules_write"
on public.work_schedules
for all
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
)
with check (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
);

-- work intervals
drop policy if exists "work_intervals_read" on public.work_intervals;
create policy "work_intervals_read"
on public.work_intervals
for select
using (
  exists (
    select 1
    from public.work_schedules s
    where s.id = work_intervals.schedule_id
      and (s.company_id = public.current_company_id() or public.is_super_admin())
  )
);

drop policy if exists "work_intervals_write" on public.work_intervals;
create policy "work_intervals_write"
on public.work_intervals
for all
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and exists (
    select 1
    from public.work_schedules s
    where s.id = work_intervals.schedule_id
      and (s.company_id = public.current_company_id() or public.is_super_admin())
  )
)
with check (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and exists (
    select 1
    from public.work_schedules s
    where s.id = work_intervals.schedule_id
      and (s.company_id = public.current_company_id() or public.is_super_admin())
  )
);

-- geofences
drop policy if exists "geofences_read" on public.geofences;
create policy "geofences_read"
on public.geofences
for select
using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists "geofences_write" on public.geofences;
create policy "geofences_write"
on public.geofences
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

-- company sites (filiais)
drop policy if exists "company_sites_read" on public.company_sites;
create policy "company_sites_read"
on public.company_sites
for select
using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists "company_sites_write" on public.company_sites;
create policy "company_sites_write"
on public.company_sites
for all
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
)
with check (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
);

-- profile sites (atribuicoes de filial por colaborador)
drop policy if exists "profile_sites_read" on public.profile_sites;
create policy "profile_sites_read"
on public.profile_sites
for select
using (
  profile_id = auth.uid()
  or public.is_super_admin()
  or (
    company_id = public.current_company_id()
    and public.current_user_role() in ('LEADER', 'MANAGER')
  )
);

drop policy if exists "profile_sites_write" on public.profile_sites;
create policy "profile_sites_write"
on public.profile_sites
for all
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
)
with check (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
);

-- time_entries
drop policy if exists "entries_read" on public.time_entries;
create policy "entries_read"
on public.time_entries
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    public.current_user_role() in ('LEADER', 'MANAGER')
    and company_id = public.current_company_id()
    and (
      public.current_user_role() = 'MANAGER'
      or exists (
        select 1
        from public.profiles p
        where p.id = time_entries.user_id
          and p.department_id = public.current_department_id()
      )
    )
  )
);

drop policy if exists "entries_insert" on public.time_entries;
create policy "entries_insert"
on public.time_entries
for insert
with check (
  company_id = public.current_company_id()
  and (user_id = auth.uid() or public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN'))
  and (
    site_id is null
    or exists (
      select 1
      from public.company_sites s
      where s.id = time_entries.site_id
        and s.company_id = time_entries.company_id
    )
  )
);

drop policy if exists "entries_update" on public.time_entries;
create policy "entries_update"
on public.time_entries
for update
using (
  public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN')
  and company_id = public.current_company_id()
  and (
    site_id is null
    or exists (
      select 1
      from public.company_sites s
      where s.id = time_entries.site_id
        and s.company_id = time_entries.company_id
    )
  )
)
with check (
  public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN')
  and company_id = public.current_company_id()
  and (
    site_id is null
    or exists (
      select 1
      from public.company_sites s
      where s.id = time_entries.site_id
        and s.company_id = time_entries.company_id
    )
  )
);

-- certificates
drop policy if exists "certificates_read" on public.certificates;
create policy "certificates_read"
on public.certificates
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    public.current_user_role() in ('LEADER', 'MANAGER')
    and company_id = public.current_company_id()
    and (
      public.current_user_role() = 'MANAGER'
      or exists (
        select 1
        from public.profiles p
        where p.id = certificates.user_id
          and p.department_id = public.current_department_id()
      )
    )
  )
);

drop policy if exists "certificates_write" on public.certificates;
create policy "certificates_write"
on public.certificates
for all
using (
  company_id = public.current_company_id()
  and (user_id = auth.uid() or public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN'))
)
with check (
  company_id = public.current_company_id()
  and (user_id = auth.uid() or public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN'))
);

-- absence justifications
drop policy if exists "absence_read" on public.absence_justifications;
create policy "absence_read"
on public.absence_justifications
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.can_review_user(user_id)
);

drop policy if exists "absence_write" on public.absence_justifications;
drop policy if exists "absence_insert" on public.absence_justifications;
create policy "absence_insert"
on public.absence_justifications
for insert
with check (
  company_id = public.current_company_id()
  and (
    user_id = auth.uid()
    or public.can_review_user(user_id)
  )
  and (
    created_by is null
    or created_by = auth.uid()
    or public.can_review_user(user_id)
  )
);

drop policy if exists "absence_write" on public.absence_justifications;
create policy "absence_write"
on public.absence_justifications
for update
using (
  company_id = public.current_company_id()
  and public.can_review_user(user_id)
)
with check (
  company_id = public.current_company_id()
  and public.can_review_user(user_id)
);

-- invitations
drop policy if exists "invitations_read" on public.invitations;
create policy "invitations_read"
on public.invitations
for select
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and company_id = public.current_company_id()
);

drop policy if exists "invitations_write" on public.invitations;
create policy "invitations_write"
on public.invitations
for all
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and company_id = public.current_company_id()
)
with check (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and company_id = public.current_company_id()
);

-- audit logs (read-only for managers/admin)
drop policy if exists "audit_read" on public.audit_logs;
create policy "audit_read"
on public.audit_logs
for select
using (
  public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
);

drop policy if exists "audit_write" on public.audit_logs;
create policy "audit_write"
on public.audit_logs
for insert
with check (
  public.current_user_role() in ('LEADER', 'MANAGER', 'OWNER', 'SUPER_ADMIN')
  and (company_id = public.current_company_id() or public.is_super_admin())
);

drop policy if exists "billing_subscriptions_read" on public.billing_subscriptions;
create policy "billing_subscriptions_read"
on public.billing_subscriptions
for select
using (
  company_id = public.current_company_id()
  and public.current_user_role() in ('MANAGER', 'OWNER', 'SUPER_ADMIN')
);

-- storage objects (buckets privados com acesso por empresa)
-- OBS: no Supabase, a tabela storage.objects ja vem com RLS habilitado e
-- o usuario do SQL Editor pode nao ser o owner (erro 42501). Nao e necessario
-- reativar RLS aqui.

drop policy if exists "storage_objects_read_company_logos" on storage.objects;
create policy "storage_objects_read_company_logos"
on storage.objects
for select
using (
  bucket_id = 'company-logos'
  and (
    public.is_super_admin()
    or (
      auth.role() = 'authenticated'
      and public.storage_company_id(name) = public.current_company_id()
    )
  )
);

drop policy if exists "storage_objects_write_company_logos" on storage.objects;
create policy "storage_objects_write_company_logos"
on storage.objects
for all
using (
  bucket_id = 'company-logos'
  and public.can_manage_company(public.storage_company_id(name))
)
with check (
  bucket_id = 'company-logos'
  and public.can_manage_company(public.storage_company_id(name))
);

drop policy if exists "storage_objects_read_company" on storage.objects;
create policy "storage_objects_read_company"
on storage.objects
for select
using (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and (
    auth.role() = 'authenticated'
    and public.can_access_user_file(name)
  )
);

drop policy if exists "storage_objects_insert_company" on storage.objects;
create policy "storage_objects_insert_company"
on storage.objects
for insert
with check (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and (
    auth.role() = 'authenticated'
    and public.storage_company_id(name) = public.current_company_id()
    and (
      public.storage_owner_id(name) = auth.uid()
      or public.can_review_user(public.storage_owner_id(name))
      or public.can_manage_company(public.storage_company_id(name))
    )
  )
);

drop policy if exists "storage_objects_update_company" on storage.objects;
create policy "storage_objects_update_company"
on storage.objects
for update
using (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and (
    auth.role() = 'authenticated'
    and public.can_access_user_file(name)
  )
)
with check (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and (
    auth.role() = 'authenticated'
    and public.storage_company_id(name) = public.current_company_id()
    and (
      public.storage_owner_id(name) = auth.uid()
      or public.can_review_user(public.storage_owner_id(name))
      or public.can_manage_company(public.storage_company_id(name))
    )
  )
);

drop policy if exists "storage_objects_delete_company" on storage.objects;
create policy "storage_objects_delete_company"
on storage.objects
for delete
using (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and (
    auth.role() = 'authenticated'
    and public.can_access_user_file(name)
  )
);
