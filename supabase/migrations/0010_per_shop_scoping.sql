-- =====================================================================
-- Per-shop read scoping. Brand users (Shop Manager / Executive / Regional
-- Manager) can read ONLY their own shop's (or region's) rows. Full-access
-- roles (Procurement Admin / Category Manager) still read everything.
-- Write policies are unchanged (Procurement Admin only). Idempotent.
-- Requires 0001 (profiles) and 0004 (ap_spend).
-- =====================================================================

-- ---------- Caller scope accessors (no-arg, cached per statement) ----------
create or replace function public.my_role()
  returns text language sql stable security definer set search_path to 'public' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_shop()
  returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(shop, '') from public.profiles where id = auth.uid()
$$;

create or replace function public.my_region()
  returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(region, '') from public.profiles where id = auth.uid()
$$;

-- These are only meaningful for an authenticated session. Each returns ONLY
-- the caller's own row; revoke the default PUBLIC grant so anon cannot call
-- them via RPC, and grant explicitly to authenticated (needed by the RLS
-- policies below).
revoke execute on function public.my_role()   from public, anon;
revoke execute on function public.my_shop()   from public, anon;
revoke execute on function public.my_region() from public, anon;
grant  execute on function public.my_role()   to authenticated;
grant  execute on function public.my_shop()   to authenticated;
grant  execute on function public.my_region() to authenticated;

-- ---------- Scoped SELECT policies ----------
-- procurement_skus
drop policy if exists "procurement_skus auth read" on public.procurement_skus;
create policy "procurement_skus auth read" on public.procurement_skus
  for select to authenticated using (
    public.my_role() in ('Procurement Admin', 'Category Manager')
    or (public.my_role() = 'Regional Manager' and region = public.my_region())
    or (public.my_role() in ('Shop Manager', 'Executive')
        and (shop = public.my_shop() or shop_code = public.my_shop()))
  );

-- procurement_ap_spend
drop policy if exists "ap_spend auth read" on public.procurement_ap_spend;
create policy "ap_spend auth read" on public.procurement_ap_spend
  for select to authenticated using (
    public.my_role() in ('Procurement Admin', 'Category Manager')
    or (public.my_role() = 'Regional Manager' and region = public.my_region())
    or (public.my_role() in ('Shop Manager', 'Executive')
        and (shop = public.my_shop() or shop_code = public.my_shop()))
  );

-- procurement_brands (shop master) — brand users see only their own brand(s)
drop policy if exists "procurement_brands auth read" on public.procurement_brands;
create policy "procurement_brands auth read" on public.procurement_brands
  for select to authenticated using (
    public.my_role() in ('Procurement Admin', 'Category Manager')
    or (public.my_role() = 'Regional Manager' and region = public.my_region())
    or (public.my_role() in ('Shop Manager', 'Executive')
        and (shop_name = public.my_shop() or code = public.my_shop()))
  );
