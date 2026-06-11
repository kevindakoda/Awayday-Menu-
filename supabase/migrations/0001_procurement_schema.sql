-- =====================================================================
-- Procurement Savings Portal — full backend schema (idempotent).
-- Run this on a fresh Supabase project to stand up everything the portal
-- needs: identity/role tables, helper functions, RLS, and the three
-- procurement tables. Safe to re-run.
--
-- Apply with the Supabase MCP (apply_migration), the SQL editor, or:
--   supabase db execute -f supabase/migrations/0001_procurement_schema.sql
-- =====================================================================

-- ---------- Identity & roles ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'Shop Manager',
  shop       text,
  region     text,
  created_at timestamptz default now()
);

create table if not exists public.admins (
  email      text primary key,
  granted_at timestamptz default now(),
  granted_by text default ''
);

-- ---------- Helper functions ----------
create or replace function public.can_edit_procurement()
  returns boolean language sql stable set search_path to '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'Procurement Admin'
  );
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.set_updated_at()
  returns trigger language plpgsql set search_path to '' as $$
  begin new.updated_at = now(); return new; end $$;

-- Prevent non-admins from escalating their own role/shop/region.
create or replace function public.enforce_profile_privilege_lock()
  returns trigger language plpgsql security definer set search_path to '' as $$
declare caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if (new.role is distinct from old.role
      or new.shop is distinct from old.shop
      or new.region is distinct from old.region)
     and coalesce(caller_role, '') <> 'Procurement Admin' then
    raise exception 'Only a Procurement Admin may change role, shop, or region.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profile_privilege_lock on public.profiles;
create trigger trg_profile_privilege_lock before update on public.profiles
  for each row execute function public.enforce_profile_privilege_lock();

-- ---------- Procurement tables ----------
create table if not exists public.procurement_brands (
  code       text primary key,
  shop_name  text not null default '',
  region     text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_skus (
  id                    text primary key,         -- unique surrogate key
  sku                   text not null default '', -- vendor SKU (may repeat across brands)
  product_name          text not null default '',
  description           text default '',
  category              text default 'Other',
  subcategory           text default 'Miscellaneous',
  current_vendor        text default '',
  recommended_vendor    text default '',
  current_unit_price    numeric default 0,
  new_unit_price        numeric default 0,
  unit_of_measure       text default 'Each',
  pack_size             text default '',
  annual_quantity       integer default 0,
  shop                  text default '',
  shop_code             text default '',
  region                text default '',
  quality_tier          text default 'Standard',
  implementation_status text default 'Not Reviewed',
  review_owner          text not null default '',
  target_date           text not null default '',
  preferred_item        boolean default false,
  contracted_item       boolean default false,
  image_url             text default '',
  notes                 text default '',
  updated_at            timestamptz default now()
);

create table if not exists public.procurement_contracts (
  id              text primary key,
  vendor_name     text not null default '',
  title           text not null default '',
  effective_date  text not null default '',
  expiration_date text not null default '',
  source          text not null default '',
  items           jsonb not null default '[]'::jsonb,  -- [{name,description,category,subcategory,unitPrice,uom,packSize,notes}]
  created_at      timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles              enable row level security;
alter table public.admins                enable row level security;
alter table public.procurement_brands    enable row level security;
alter table public.procurement_skus      enable row level security;
alter table public.procurement_contracts enable row level security;

-- profiles: a user reads/updates only their own row.
drop policy if exists "profiles read own"   on public.profiles;
create policy "profiles read own"   on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- admins: public read, only admins write.
drop policy if exists "anyone reads admins" on public.admins;
create policy "anyone reads admins" on public.admins for select to anon, authenticated using (true);
drop policy if exists "admins write admins" on public.admins;
create policy "admins write admins" on public.admins for all to authenticated using (is_admin()) with check (is_admin());

-- procurement_*: any signed-in user reads; only Procurement Admins write.
do $$
declare t text;
begin
  foreach t in array array['procurement_brands','procurement_skus','procurement_contracts'] loop
    execute format('drop policy if exists %I on public.%I', t||' auth read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||' auth read', t);
    execute format('drop policy if exists %I on public.%I', t||' editor insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (can_edit_procurement())', t||' editor insert', t);
    execute format('drop policy if exists %I on public.%I', t||' editor update', t);
    execute format('create policy %I on public.%I for update to authenticated using (can_edit_procurement()) with check (can_edit_procurement())', t||' editor update', t);
    execute format('drop policy if exists %I on public.%I', t||' editor delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_edit_procurement())', t||' editor delete', t);
  end loop;
end $$;
