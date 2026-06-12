-- =====================================================================
-- User access management (idempotent). Lets Procurement Admins see and
-- manage every profile, and lets new users create their own
-- (non-privileged) profile row on first sign-in.
-- Requires 0001_procurement_schema.sql.
-- =====================================================================

-- SECURITY DEFINER so profiles policies can check the caller's role without
-- recursing into profiles RLS.
create or replace function public.is_procurement_admin()
  returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'Procurement Admin'
  );
$$;
revoke execute on function public.is_procurement_admin() from anon;

-- New users self-create their profile on first sign-in; role is locked to the
-- default so nobody can self-grant privileges (updates are guarded by the
-- privilege-lock trigger).
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (auth.uid() = id and role = 'Shop Manager');

-- Procurement Admins manage everyone.
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles for select to authenticated
  using (is_procurement_admin());

drop policy if exists "profiles admin update all" on public.profiles;
create policy "profiles admin update all" on public.profiles for update to authenticated
  using (is_procurement_admin()) with check (is_procurement_admin());
