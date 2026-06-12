// Owner-only user invitations for the Procurement Savings Portal.
// Sends a Supabase Auth invite email AND pre-assigns the new user's role,
// shop, and region in public.profiles — both require the service-role key,
// which is why this lives server-side.
//
// Authorization: verify_jwt = true gets us a valid signed-in caller; on top
// of that, the caller's email must exist in public.admins (the portal-owner
// allowlist, writable only by existing admins). Everyone else gets 403.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const ROLES = ["Procurement Admin", "Category Manager", "Regional Manager", "Shop Manager", "Executive"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const svcHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

// The platform has already verified the JWT (verify_jwt = true), so the
// payload is trustworthy; we only need to read the email claim out of it.
function callerEmail(req: Request): string {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part));
    return String(payload.email || "").toLowerCase();
  } catch {
    return "";
  }
}

async function isPortalAdmin(email: string): Promise<boolean> {
  if (!email) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/admins?select=email&email=ilike.${encodeURIComponent(email)}`,
    { headers: svcHeaders },
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (!(await isPortalAdmin(callerEmail(req)))) {
    return json({ error: "Only the portal owner can send invitations." }, 403);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const role = ROLES.includes(body.role) ? body.role : "Shop Manager";
  const shop = String(body.shop || "");
  const region = String(body.region || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);

  // Where the invite link lands. Must be the Site URL or in the additional
  // redirect URLs allowlist (Auth -> URL Configuration).
  const redirectTo = String(body.redirectTo || "");
  const inviteUrl = `${SUPABASE_URL}/auth/v1/invite` +
    (redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "");

  const inviteRes = await fetch(inviteUrl, {
    method: "POST",
    headers: svcHeaders,
    body: JSON.stringify({ email, data: { full_name: fullName } }),
  });
  const invited = await inviteRes.json();
  if (!inviteRes.ok) {
    const msg = invited && (invited.msg || invited.message || invited.error_description || invited.error);
    return json({ error: msg || `Invite failed (${inviteRes.status}).` }, 400);
  }

  // Pre-assign the role so the user lands with the right access. Service role
  // bypasses RLS; merge-duplicates makes re-invites safe.
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...svcHeaders, prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: invited.id, email, full_name: fullName, role, shop, region }),
  });
  if (!profileRes.ok) {
    const t = await profileRes.text();
    return json({ error: "Invite sent, but assigning the role failed: " + t.slice(0, 300) }, 500);
  }

  return json({ ok: true, email, role });
});
