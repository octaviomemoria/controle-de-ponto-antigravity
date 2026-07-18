-- Migration: Add OWNER role to existing database
-- Date: 2026-03-24
-- Purpose: Add OWNER as equivalent to SUPER_ADMIN for formalization

-- Add OWNER to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'OWNER';

-- Create is_owner() function if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role IN ('OWNER', 'SUPER_ADMIN') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Update can_manage_company to use is_owner() instead of is_super_admin()
CREATE OR REPLACE FUNCTION public.can_manage_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  select
    public.is_owner()
    or (
      public.current_user_role() = 'MANAGER'
      and target_company_id = public.current_company_id()
    )
$$;

-- Update can_review_user to use is_owner() instead of is_super_admin()
CREATE OR REPLACE FUNCTION public.can_review_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
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

-- Update can_access_user_file to use is_owner() instead of is_super_admin()
CREATE OR REPLACE FUNCTION public.can_access_user_file(storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
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
