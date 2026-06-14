-- =====================================================================
-- Auto-publish the weekly Market Insights issue via pg_cron.
-- The cron job calls the market-insights edge function with the
-- service-role key stored in Supabase Vault (secret name: service_role_key),
-- which makes the function generate AND persist the issue unattended.
--
-- ONE-TIME SETUP (run privately in the SQL editor, with your real key):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- Find the key in Dashboard → Project Settings → API → service_role.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_market_brief()
returns void language plpgsql security definer set search_path = '' as $$
declare key text;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if key is null then
    raise notice 'trigger_market_brief: no service_role_key secret in Vault yet; skipping.';
    return;
  end if;
  perform net.http_post(
    url := 'https://thtbncnlgrsryujdsriz.supabase.co/functions/v1/market-insights',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end; $$;

revoke all on function public.trigger_market_brief() from anon, authenticated;

do $$ begin perform cron.unschedule('weekly-market-brief'); exception when others then null; end $$;
select cron.schedule('weekly-market-brief', '0 13 * * 1', 'select public.trigger_market_brief()');
