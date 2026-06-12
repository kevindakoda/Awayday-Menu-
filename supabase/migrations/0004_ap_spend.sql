-- =====================================================================
-- AP spend (accounts-payable transactions) — time-stamped purchase lines
-- powering the Buying Patterns / seasonality view. Idempotent.
-- Requires 0001_procurement_schema.sql (uses can_edit_procurement()).
-- =====================================================================
create table if not exists public.procurement_ap_spend (
  id           text primary key,
  shop         text not null default '',
  shop_code    text not null default '',
  region       text not null default '',
  category     text not null default 'Other',
  subcategory  text not null default '',
  vendor       text not null default '',
  invoice_date date,
  amount       numeric not null default 0,
  quantity     numeric not null default 0,
  description  text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists ap_spend_shop_idx on public.procurement_ap_spend (shop);
create index if not exists ap_spend_date_idx on public.procurement_ap_spend (invoice_date);

alter table public.procurement_ap_spend enable row level security;

drop policy if exists "ap_spend auth read"     on public.procurement_ap_spend;
create policy "ap_spend auth read"     on public.procurement_ap_spend for select to authenticated using (true);
drop policy if exists "ap_spend editor insert" on public.procurement_ap_spend;
create policy "ap_spend editor insert" on public.procurement_ap_spend for insert to authenticated with check (can_edit_procurement());
drop policy if exists "ap_spend editor update" on public.procurement_ap_spend;
create policy "ap_spend editor update" on public.procurement_ap_spend for update to authenticated using (can_edit_procurement()) with check (can_edit_procurement());
drop policy if exists "ap_spend editor delete" on public.procurement_ap_spend;
create policy "ap_spend editor delete" on public.procurement_ap_spend for delete to authenticated using (can_edit_procurement());
