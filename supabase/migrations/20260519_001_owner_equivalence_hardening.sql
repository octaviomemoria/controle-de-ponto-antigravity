-- Migration: harden OWNER equivalence after production policies
-- Date: 2026-05-19
-- Purpose: make OWNER consistently equivalent to SUPER_ADMIN in helper functions.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select role in ('OWNER', 'SUPER_ADMIN') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
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
