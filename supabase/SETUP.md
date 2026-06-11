# Standing up the Procurement Portal on its own Supabase project

This moves the portal off the shared `jbmradylrcnxeciskslt` project (which it
currently co-habits with the Awayday event app) onto a dedicated project on
your upgraded account.

## 0. Link the upgraded account to this assistant (one-time, your side)
The Supabase integration here is currently connected only to the **free**
`CarrBanksBackEnd` org. To let me build the new project for you, reconnect the
Supabase MCP/integration to the **upgraded** account:

- In the Claude Code connectors / MCP settings, reconnect "Supabase" and
  authorize the upgraded account (or paste a Supabase **personal access token**
  for it: Supabase dashboard → Account → Access Tokens).
- Once `list_organizations` shows the upgraded org, I can create the project and
  run everything below automatically.

You can also do all of this by hand — the steps are short.

## 1. Create the project
New project on the upgraded org (e.g. name `procurement-portal`, region close to
your users). Wait for it to be `ACTIVE_HEALTHY`.

## 2. Apply the schema
Run [`migrations/0001_procurement_schema.sql`](migrations/0001_procurement_schema.sql)
(SQL editor, `supabase db execute`, or MCP `apply_migration`). It is idempotent
and creates: `profiles`, `admins`, the helper functions
(`can_edit_procurement`, `is_admin`, …), the privilege-lock trigger, the three
`procurement_*` tables, and all RLS policies.

## 3. Deploy the edge function
Deploy [`functions/ai-assist`](functions/ai-assist/index.ts) with `verify_jwt = true`.

## 4. Secrets (Edge Functions → Manage secrets)
- `ANTHROPIC_API_KEY` — https://console.anthropic.com/settings/keys
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey  *(optional)*

## 5. Point the app at the new project
Edit [`../config.js`](../config.js):
```js
window.PSP_CONFIG = {
  SUPABASE_URL: "https://<NEW_REF>.supabase.co",
  SUPABASE_KEY: "<NEW publishable/anon key>",   // Project Settings → API
};
```

## 6. Create your admin login (auth does NOT migrate)
A new project has a fresh user pool, so existing logins do not carry over:
1. In the app's login screen, sign up (or create the user in Dashboard → Auth).
2. Make yourself a Procurement Admin so you can upload/edit:
   ```sql
   insert into public.profiles (id, email, full_name, role)
   select id, email, 'Your Name', 'Procurement Admin' from auth.users where email = 'you@company.com'
   on conflict (id) do update set role = 'Procurement Admin';

   insert into public.admins (email) values ('you@company.com') on conflict do nothing;
   ```

## 7. Migrate the catalog data (23 brands + 609 SKUs)
The brands/SKUs are app data (not tied to auth), so they copy cleanly. When the
upgraded account is linked I will export them from the old project and insert
them into the new one (CSV or SQL). Contracts copy the same way if any exist.

---
After step 5 deploys (push to the GitHub Pages branch), the live site talks only
to the new project. The old `procurement_*` tables can then be dropped from the
shared project.
