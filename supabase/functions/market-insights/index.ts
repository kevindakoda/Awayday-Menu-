// Weekly market-intelligence briefings for the Procurement Savings Portal.
// Uses Claude's server-side web-search tool to pull current market data on the
// categories that move hotel-supply costs — linens (cotton/textiles),
// disposables (paper, pulp, resin/plastics), tariffs/trade policy, and
// hospitality technology — and writes a sourced "Bloomberg-style" briefing.
//
// Auth: verify_jwt = true, plus the caller must be a Procurement Admin
// (checked via the service role) so web-search spend stays controlled.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function claim(req: Request, name: string): string | null {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p[name] ?? null;
  } catch { return null; }
}

async function isProcurementAdmin(sub: string | null): Promise<boolean> {
  if (!sub) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${sub}`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] && rows[0].role === "Procurement Admin";
}

const MARKET_SYS =
  "You are a procurement market-intelligence analyst for a hotel-supply (hospitality) buying team. " +
  "Produce a concise WEEKLY market briefing in the style of a Bloomberg market wrap. Use web search to ground every claim in current data. " +
  "Cover these four sections, in this order, each with a one-line trend verdict then 2-4 tight bullets with figures, % moves, and dates:\n" +
  "1. LINENS — cotton & textile commodity prices, mills, freight, supply.\n" +
  "2. DISPOSABLES — paper/pulp, plastics & resin, packaging costs.\n" +
  "3. TARIFFS & TRADE — import duties, trade policy, and supply-chain actions affecting these goods.\n" +
  "4. TECHNOLOGY — hospitality tech, smart locks/IoT, devices, component/chip pricing.\n" +
  "For each section add a short 'What it means for buyers' line with a concrete action (buy now, defer, lock contract, switch). " +
  "Start with a 2-sentence executive summary. Plain text, clear section headers in CAPS, no markdown tables. Cite specific outlets/figures.";

function collectSources(content: unknown[]): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const b of (content || []) as any[]) {
    if (b && b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) {
        if (r && r.url && !seen.has(r.url)) { seen.add(r.url); out.push({ title: r.title || r.url, url: r.url }); }
      }
    }
    if (b && b.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        const u = c && (c.url || (c.source && c.source.url));
        if (u && !seen.has(u)) { seen.add(u); out.push({ title: c.title || u, url: u }); }
      }
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured on this project.", code: "NO_KEY" }, 503);
  if (!(await isProcurementAdmin(claim(req, "sub")))) {
    return json({ error: "Only a Procurement Admin can generate market insights." }, 403);
  }

  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2800,
      system: MARKET_SYS,
      messages: [{ role: "user", content: `Produce this week's hotel-supply market intelligence briefing. Today is ${today}. Search the web for the latest figures before writing.` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("Claude API error " + res.status);
    return json({ error: msg }, 500);
  }
  const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  const sources = collectSources(data.content || []);
  return json({ text, sources, asOf: today });
});
