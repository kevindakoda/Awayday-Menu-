-- =====================================================================
-- Remove the Market Insights feature (page deleted from the app).
-- Cleans up everything 0005/0006 created: the weekly pg_cron job, the
-- trigger helper, and the market_insights table. Idempotent — safe to
-- run on projects that never had the feature applied.
-- =====================================================================
do $$ begin perform cron.unschedule('weekly-market-brief'); exception when others then null; end $$;
drop function if exists public.trigger_market_brief();
drop table if exists public.market_insights;
