-- Production hardening for API/RLS/storage behavior
-- Apply on environments that already have the base schema and previous RLS installed.

create or replace function public.can_manage_company(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin()
    or (
      public.current_user_role() = 'MANAGER'
      and target_company_id = public.current_company_id()
    )
$$;

create or replace function public.can_review_user(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin()
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
    public.is_super_admin()
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

drop policy if exists "departments_write" on public.departments;
create policy "departments_write"
on public.departments
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

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

drop policy if exists "settings_write" on public.company_settings;
create policy "settings_write"
on public.company_settings
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "geofences_write" on public.geofences;
create policy "geofences_write"
on public.geofences
for all
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "absence_read" on public.absence_justifications;
create policy "absence_read"
on public.absence_justifications
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.can_review_user(user_id)
);

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
  and auth.role() = 'authenticated'
  and public.can_access_user_file(name)
);

drop policy if exists "storage_objects_insert_company" on storage.objects;
create policy "storage_objects_insert_company"
on storage.objects
for insert
with check (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and auth.role() = 'authenticated'
  and public.storage_company_id(name) = public.current_company_id()
  and (
    public.storage_owner_id(name) = auth.uid()
    or public.can_review_user(public.storage_owner_id(name))
    or public.can_manage_company(public.storage_company_id(name))
  )
);

drop policy if exists "storage_objects_update_company" on storage.objects;
create policy "storage_objects_update_company"
on storage.objects
for update
using (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and auth.role() = 'authenticated'
  and public.can_access_user_file(name)
)
with check (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and auth.role() = 'authenticated'
  and public.storage_company_id(name) = public.current_company_id()
  and (
    public.storage_owner_id(name) = auth.uid()
    or public.can_review_user(public.storage_owner_id(name))
    or public.can_manage_company(public.storage_company_id(name))
  )
);

drop policy if exists "storage_objects_delete_company" on storage.objects;
create policy "storage_objects_delete_company"
on storage.objects
for delete
using (
  bucket_id in ('certificates', 'employee-photos', 'punch-photos')
  and auth.role() = 'authenticated'
  and public.can_access_user_file(name)
);
