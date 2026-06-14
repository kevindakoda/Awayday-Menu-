-- =====================================================================
-- Savings realization snapshots — periodic captures of the funnel so
-- realized savings can be trended over time. Idempotent.
-- Requires 0001_procurement_schema.sql (uses can_edit_procurement()).
-- =====================================================================
create table if not exists public.savings_snapshots (
  snapshot_date date primary key,
  identified  numeric not null default 0,
  approved    numeric not null default 0,
  implemented numeric not null default 0,
  baseline    numeric not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.savings_snapshots enable row level security;
drop policy if exists "snap auth read"    on public.savings_snapshots;
create policy "snap auth read"    on public.savings_snapshots for select to authenticated using (true);
drop policy if exists "snap editor write" on public.savings_snapshots;
create policy "snap editor write" on public.savings_snapshots for all to authenticated using (can_edit_procurement()) with check (can_edit_procurement());
