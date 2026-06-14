-- =====================================================================
-- Add a SKU column to AP spend so vendor sales reports can track item-level
-- spend/volume and surface same-vendor duplicate SKUs. Idempotent.
-- =====================================================================
alter table public.procurement_ap_spend add column if not exists sku text not null default '';
create index if not exists ap_spend_vendor_idx on public.procurement_ap_spend (vendor);
