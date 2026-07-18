-- Never trust raw_user_meta_data for authorization or tenant assignment.
-- Administrative provisioning sets the authoritative profile immediately after
-- creating/inviting the auth user.
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
