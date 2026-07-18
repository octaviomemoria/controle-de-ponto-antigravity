-- Helper functions used inside profiles RLS must bypass that same table's RLS.
-- A fixed empty search_path prevents object-shadowing in SECURITY DEFINER code.
alter function public.current_company_id() security definer;
alter function public.current_company_id() set search_path = '';

alter function public.current_user_role() security definer;
alter function public.current_user_role() set search_path = '';

alter function public.current_department_id() security definer;
alter function public.current_department_id() set search_path = '';

alter function public.is_super_admin() security definer;
alter function public.is_super_admin() set search_path = '';

alter function public.is_owner() security definer;
alter function public.is_owner() set search_path = '';

alter function public.can_review_user(uuid) security definer;
alter function public.can_review_user(uuid) set search_path = '';
