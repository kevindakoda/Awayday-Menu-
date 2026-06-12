# Migration runbook — move the Procurement Portal to its own project

**Goal:** stand up the dedicated Supabase project `thtbncnlgrsryujdsriz`
(upgraded account) and move the live catalog off the shared project
`jbmradylrcnxeciskslt` (free org, co-habited with the Awayday app).

**For the operator (Claude session):** the Supabase connector must be
authenticated with a **personal access token** for `kevindakoda81@gmail.com`
(account-wide), not an org-scoped OAuth grant. Verify before starting:
`list_projects` must show BOTH `jbmradylrcnxeciskslt` and
`thtbncnlgrsryujdsriz`. If it doesn't, stop and tell the user to fix the
connector token and start a fresh session.

Run the steps in order. All of them are idempotent / safe to re-run.

## 1. Schema on the new project
Apply `supabase/migrations/0001_procurement_schema.sql` to
`thtbncnlgrsryujdsriz` via `apply_migration` (name: `procurement_schema`).
Creates profiles/admins, helper functions, the privilege-lock trigger, the
three `procurement_*` tables, and all RLS policies.

## 2. Copy the catalog data (old → new)
Source of truth is the OLD project's database — **not** `js/data.js`, which
only contains a 5-shop demo dataset. Current production counts (2026-06-12):
**23 brands, 609 SKUs, 0 contracts.**

- Read all rows from `public.procurement_brands` and `public.procurement_skus`
  on `jbmradylrcnxeciskslt` (`execute_sql`, page the SKUs ~150 rows at a time).
- Insert them into the same tables on `thtbncnlgrsryujdsriz`
  (`execute_sql` INSERTs with proper escaping, e.g. generated with
  `format('%L', col)`), `on conflict do nothing`.
- Verify counts match: 23 / 609.
- `procurement_contracts` is empty; skip unless rows exist at run time.

## 3. Edge function on the new project
Deploy `supabase/functions/ai-assist/index.ts` to `thtbncnlgrsryujdsriz`
with `verify_jwt = true`, name `ai-assist`. Deploy the file from the repo
verbatim — do not reconstruct or edit it.

## 4. Secrets (user does this in the dashboard)
Edge Functions → Manage secrets on the NEW project:
- `ANTHROPIC_API_KEY` — required (https://console.anthropic.com/settings/keys)
- `GEMINI_API_KEY` — optional (https://aistudio.google.com/apikey)

## 5. Front-end config
`config.js` already points at the new project
(`https://thtbncnlgrsryujdsriz.supabase.co` + its publishable key) — verify,
don't change unless wrong.

## 6. Admin login on the new project (user action + one SQL)
Auth users do NOT migrate. The user signs up in the app (or Dashboard → Auth)
on the new project, then run on `thtbncnlgrsryujdsriz`:
```sql
insert into public.profiles (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name',''), 'Procurement Admin'
from auth.users where lower(email) = lower('kevindakoda81@gmail.com')
on conflict (id) do update set role = 'Procurement Admin';

insert into public.admins (email) values ('kevindakoda81@gmail.com')
on conflict do nothing;
```

## 7. Verify, then decommission
- App loads the catalog from the new project (Dashboard shows 23 shops / 609
  SKUs), AI features respond once secrets are set.
- Only after the user confirms the app works: drop the `procurement_*` tables
  and related policies/functions from the OLD project `jbmradylrcnxeciskslt`
  (ask first — the Awayday app shares that project; touch nothing else there).
