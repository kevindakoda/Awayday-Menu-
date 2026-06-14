-- =====================================================================
-- Vendor master — a managed, categorized, consolidated vendor list with
-- alias families (e.g. all Breezeway / Guesty variants -> one vendor).
-- Editable in the app (create / upload / categorize). Idempotent.
-- Requires 0001_procurement_schema.sql (uses can_edit_procurement()).
-- =====================================================================
create table if not exists public.procurement_vendors (
  id         text primary key,
  name       text not null,
  category   text not null default 'Other',
  aliases    jsonb not null default '[]'::jsonb,
  notes      text not null default '',
  status     text not null default 'Active',
  created_at timestamptz not null default now()
);
create unique index if not exists procurement_vendors_name_idx on public.procurement_vendors (lower(name));

alter table public.procurement_vendors enable row level security;
drop policy if exists "vendors auth read"    on public.procurement_vendors;
create policy "vendors auth read"    on public.procurement_vendors for select to authenticated using (true);
drop policy if exists "vendors editor write" on public.procurement_vendors;
create policy "vendors editor write" on public.procurement_vendors for all to authenticated using (can_edit_procurement()) with check (can_edit_procurement());
