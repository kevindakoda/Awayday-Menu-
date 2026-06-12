// AI assist proxy for the Procurement Savings Portal.
// Calls Claude (Anthropic) or Gemini (Google) server-side so the API keys
// never ship in the static front-end. Requires a valid Supabase JWT
// (verify_jwt = true) and the ANTHROPIC_API_KEY and/or GEMINI_API_KEY secrets.
// Actions: categorize | ocr | contract | analyze | ask | providers.
// The request may include `provider`: "claude" (default) or "gemini".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const CLAUDE_FAST = "claude-haiku-4-5-20251001";
const CLAUDE_SMART = "claude-sonnet-4-6";
const GEMINI_FAST = "gemini-2.0-flash";
const GEMINI_SMART = "gemini-2.0-flash";

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

/* ----------------------------- Claude ----------------------------- */
async function callClaude(payload: Record<string, unknown>) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("Claude API error " + res.status);
    throw new Error(msg);
  }
  return data;
}

// deno-lint-ignore no-explicit-any
function toolInput(data: any, name: string) {
  const block = (data.content || []).find((b: any) => b.type === "tool_use" && b.name === name);
  return block ? block.input : null;
}

// deno-lint-ignore no-explicit-any
function claudeText(data: any) {
  return (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}

/* ----------------------------- Gemini ----------------------------- */
async function callGemini(model: string, payload: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("Gemini API error " + res.status);
    throw new Error(msg);
  }
  return data;
}

// deno-lint-ignore no-explicit-any
function geminiText(data: any) {
  const c = data.candidates && data.candidates[0];
  const parts = (c && c.content && c.content.parts) || [];
  return parts.map((p: any) => p.text || "").join("").trim();
}

// deno-lint-ignore no-explicit-any
function geminiJson(data: any) {
  const t = geminiText(data);
  try { return JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

/* ----------------------------- shared ----------------------------- */
// deno-lint-ignore no-explicit-any
function taxonomyText(taxonomy: any) {
  if (!taxonomy) return "";
  return Object.keys(taxonomy)
    .map((c) => `- ${c}: ${(taxonomy[c] || []).join(", ")}`)
    .join("\n");
}

function keyFor(provider: string) {
  return provider === "gemini" ? GEMINI_KEY : ANTHROPIC_KEY;
}

function docPart(mediaType: string, dataB64: string, provider: string) {
  if (provider === "gemini") return { inline_data: { mime_type: mediaType, data: dataB64 } };
  return mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: dataB64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: dataB64 } };
}

/* ---------------------------- categorize -------------------------- */
// deno-lint-ignore no-explicit-any
async function categorize(body: any, provider: string) {
  const items = body.items || []; // [{index, text}]
  const sys =
    "You are a procurement catalog categorization engine for a hospitality (hotel) supply portal. " +
    "Classify each product into the single best category and a sensible subcategory from the allowed taxonomy. " +
    "Assign qualityTier as Economy, Standard, or Luxury based on wording (premium/luxury/sateen -> Luxury; basic/economy -> Economy; otherwise Standard). " +
    "Allowed taxonomy (category -> subcategories):\n" + taxonomyText(body.taxonomy);
  const list = items.map((it: any) => `${it.index}. ${it.text}`).join("\n");

  if (provider === "gemini") {
    const data = await callGemini(GEMINI_FAST, {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: `Classify these products:\n${list}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  index: { type: "INTEGER" },
                  category: { type: "STRING" },
                  subcategory: { type: "STRING" },
                  qualityTier: { type: "STRING", enum: ["Economy", "Standard", "Luxury"] },
                  confidence: { type: "STRING", enum: ["High", "Medium", "Low"] },
                },
                required: ["index", "category", "subcategory", "qualityTier", "confidence"],
              },
            },
          },
          required: ["items"],
        },
      },
    });
    return { items: (geminiJson(data).items) || [], provider };
  }

  const data = await callClaude({
    model: CLAUDE_FAST,
    max_tokens: 4096,
    system: sys,
    tools: [{
      name: "return_categorization",
      description: "Return the categorization for every product, aligned by index.",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                category: { type: "string" },
                subcategory: { type: "string" },
                qualityTier: { type: "string", enum: ["Economy", "Standard", "Luxury"] },
                confidence: { type: "string", enum: ["High", "Medium", "Low"] },
              },
              required: ["index", "category", "subcategory", "qualityTier", "confidence"],
            },
          },
        },
        required: ["items"],
      },
    }],
    tool_choice: { type: "tool", name: "return_categorization" },
    messages: [{ role: "user", content: `Classify these products:\n${list}` }],
  });
  return { items: (toolInput(data, "return_categorization") || {}).items || [], provider };
}

/* ------------------------------- ocr ------------------------------ */
const LINE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    productName: { type: "string" },
    description: { type: "string" },
    brand: { type: "string", description: "Property / shop / location name if shown" },
    region: { type: "string" },
    currentVendor: { type: "string" },
    recommendedVendor: { type: "string" },
    currentUnitPrice: { type: "number", description: "Current/old/list unit price PER EACH; if only one price is shown use this" },
    newUnitPrice: { type: "number", description: "New/negotiated/quoted unit price PER EACH if shown" },
    annualQuantity: { type: "number" },
    unitOfMeasure: { type: "string" },
    packSize: { type: "string" },
    category: { type: "string" },
    subcategory: { type: "string" },
    qualityTier: { type: "string", enum: ["Economy", "Standard", "Luxury"] },
  },
  required: ["productName"],
};
const GEMINI_LINE_ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    productName: { type: "STRING" },
    description: { type: "STRING" },
    brand: { type: "STRING" },
    region: { type: "STRING" },
    currentVendor: { type: "STRING" },
    recommendedVendor: { type: "STRING" },
    currentUnitPrice: { type: "NUMBER" },
    newUnitPrice: { type: "NUMBER" },
    annualQuantity: { type: "NUMBER" },
    unitOfMeasure: { type: "STRING" },
    packSize: { type: "STRING" },
    category: { type: "STRING" },
    subcategory: { type: "STRING" },
    qualityTier: { type: "STRING", enum: ["Economy", "Standard", "Luxury"] },
  },
  required: ["productName"],
};

const OCR_SYS =
  "You extract structured procurement line items from a photographed or scanned price list, invoice, quote, or product sheet for a hotel supply portal. " +
  "Read every product row. For each item capture: product name, description, current/old price and new/negotiated price PER EACH (if a price is quoted per dozen or per case, divide it down to a per-each unit price; if only one price is present put it in currentUnitPrice), quantity, unit of measure, pack size, current vendor and recommended/quoting vendor, and the brand/property name if indicated. " +
  "Then classify each item into the allowed taxonomy and assign a quality tier. Only include real product line items.\n" +
  "Allowed taxonomy (category -> subcategories):\n";

// deno-lint-ignore no-explicit-any
async function ocr(body: any, provider: string) {
  const mediaType: string = body.mediaType || "image/png";
  const dataB64: string = body.data || "";
  const sys = OCR_SYS + taxonomyText(body.taxonomy);
  const part = docPart(mediaType, dataB64, provider);

  if (provider === "gemini") {
    const data = await callGemini(GEMINI_SMART, {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [part, { text: "Extract all product line items from this document." }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: GEMINI_LINE_ITEM_SCHEMA } }, required: ["items"] },
      },
    });
    return { items: (geminiJson(data).items) || [], provider };
  }

  const data = await callClaude({
    model: CLAUDE_SMART,
    max_tokens: 8192,
    system: sys,
    tools: [{
      name: "return_line_items",
      description: "Return every extracted product line item.",
      input_schema: { type: "object", properties: { items: { type: "array", items: LINE_ITEM_SCHEMA } }, required: ["items"] },
    }],
    tool_choice: { type: "tool", name: "return_line_items" },
    messages: [{ role: "user", content: [part, { type: "text", text: "Extract all product line items from this document." }] }],
  });
  return { items: (toolInput(data, "return_line_items") || {}).items || [], provider };
}

/* ----------------------------- contract --------------------------- */
const CONTRACT_ITEM = {
  name: { type: "string", description: "Service or product name" },
  description: { type: "string" },
  category: { type: "string", description: "Best-fit category from the taxonomy" },
  subcategory: { type: "string" },
  unitPrice: { type: "number", description: "Contracted price PER EACH/unit. If quoted per dozen/case, divide down to per-each." },
  uom: { type: "string", description: "Unit of measure, e.g. each, case, stop, hour" },
  packSize: { type: "string" },
  notes: { type: "string" },
};
const GEMINI_CONTRACT_ITEM = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" }, description: { type: "STRING" }, category: { type: "STRING" },
    subcategory: { type: "STRING" }, unitPrice: { type: "NUMBER" }, uom: { type: "STRING" },
    packSize: { type: "STRING" }, notes: { type: "STRING" },
  },
  required: ["name"],
};
const CONTRACT_SYS =
  "You extract a vendor price book from a supplier CONTRACT, agreement, rate sheet, or pricing schedule for a hotel supply portal. " +
  "Identify the vendor/supplier name, a short contract title, and the effective and expiration dates if present. " +
  "Then extract EVERY priced line item — products and services (e.g. delivery, laundry, fuel surcharge). For each, capture name, description, a per-each/unit price (if a price is quoted per dozen or per case, divide it down to per each), unit of measure, pack size, and any notes. " +
  "Classify each item into the best category and subcategory from the allowed taxonomy. Only include real priced items.\n" +
  "Allowed taxonomy (category -> subcategories):\n";

// deno-lint-ignore no-explicit-any
async function contract(body: any, provider: string) {
  const mediaType: string = body.mediaType || "application/pdf";
  const dataB64: string = body.data || "";
  const sys = CONTRACT_SYS + taxonomyText(body.taxonomy);
  const part = docPart(mediaType, dataB64, provider);

  if (provider === "gemini") {
    const data = await callGemini(GEMINI_SMART, {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [part, { text: "Extract the vendor price book from this contract." }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            vendorName: { type: "STRING" }, title: { type: "STRING" },
            effectiveDate: { type: "STRING" }, expirationDate: { type: "STRING" },
            items: { type: "ARRAY", items: GEMINI_CONTRACT_ITEM },
          },
          required: ["vendorName", "items"],
        },
      },
    });
    const out = geminiJson(data);
    return { vendorName: out.vendorName || "", title: out.title || "", effectiveDate: out.effectiveDate || "", expirationDate: out.expirationDate || "", items: out.items || [], provider };
  }

  const data = await callClaude({
    model: CLAUDE_SMART,
    max_tokens: 8192,
    system: sys,
    tools: [{
      name: "return_contract",
      description: "Return the vendor name, contract dates, and every priced line item.",
      input_schema: {
        type: "object",
        properties: {
          vendorName: { type: "string" }, title: { type: "string" },
          effectiveDate: { type: "string" }, expirationDate: { type: "string" },
          items: { type: "array", items: { type: "object", properties: CONTRACT_ITEM, required: ["name"] } },
        },
        required: ["vendorName", "items"],
      },
    }],
    tool_choice: { type: "tool", name: "return_contract" },
    messages: [{ role: "user", content: [part, { type: "text", text: "Extract the vendor price book from this contract." }] }],
  });
  const out = toolInput(data, "return_contract") || {};
  return { vendorName: out.vendorName || "", title: out.title || "", effectiveDate: out.effectiveDate || "", expirationDate: out.expirationDate || "", items: out.items || [], provider };
}

/* ----------------------------- analyze ---------------------------- */
const ANALYZE_SYS =
  "You are a procurement savings analyst for a hotel supply portal. Given aggregate metrics (which may include per-shop and per-category breakdowns and a list of pricing outliers), write a concise executive review (140-200 words). Cover: total savings opportunity, the biggest shops and categories, any pricing anomalies or rows where the negotiated price is HIGHER than current (negative savings), notable quick wins, and one concrete recommendation. Plain text, short paragraphs, no markdown headers.";

// deno-lint-ignore no-explicit-any
async function analyze(body: any, provider: string) {
  const prompt = "Portal metrics (JSON):\n" + JSON.stringify(body.stats || {}, null, 2);
  if (provider === "gemini") {
    const data = await callGemini(GEMINI_SMART, {
      systemInstruction: { parts: [{ text: ANALYZE_SYS }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return { text: geminiText(data), provider };
  }
  const data = await callClaude({
    model: CLAUDE_SMART,
    max_tokens: 1024,
    system: ANALYZE_SYS,
    messages: [{ role: "user", content: prompt }],
  });
  return { text: claudeText(data), provider };
}

/* ------------------------------- ask ------------------------------ */
// Powers the Knowledge Assistant (KAI), the Risk & Spend briefing (RAI/SPAI),
// and the Data-Quality summary (DAI). The caller supplies a focused `context`
// (pre-aggregated portal data, never raw secrets) plus a natural-language
// `question`; the model answers grounded ONLY in that context.
const ASK_SYS =
  "You are an embedded procurement analyst for a hotel-supply cost-savings portal. " +
  "Answer the user's question using ONLY the PORTAL DATA provided in the prompt (catalog SKUs, vendors, shops, spend/savings roll-ups, data-quality findings, and any contracts). " +
  "Be concise, specific, and decision-oriented: cite exact figures, SKU names, vendors, and shop names straight from the data, and quantify impact in dollars where possible. " +
  "If the data does not contain the answer, say so plainly rather than guessing. " +
  "Format as plain text with short paragraphs or simple hyphen bullet lists; no markdown headers. Money like $12,345.";

// deno-lint-ignore no-explicit-any
async function ask(body: any, provider: string) {
  const ctx = typeof body.context === "string" ? body.context : JSON.stringify(body.context ?? {});
  const question = String(body.question || "").slice(0, 4000);
  const prompt = "PORTAL DATA (JSON):\n" + ctx + "\n\n----\nQUESTION: " + question;
  if (provider === "gemini") {
    const data = await callGemini(GEMINI_SMART, {
      systemInstruction: { parts: [{ text: ASK_SYS }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return { text: geminiText(data), provider };
  }
  const data = await callClaude({
    model: CLAUDE_SMART,
    max_tokens: 1500,
    system: ASK_SYS,
    messages: [{ role: "user", content: prompt }],
  });
  return { text: claudeText(data), provider };
}

/* ------------------------------ serve ----------------------------- */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const provider = body.provider === "gemini" ? "gemini" : "claude";

  if (body.action === "providers") {
    return json({ providers: { claude: !!ANTHROPIC_KEY, gemini: !!GEMINI_KEY } });
  }

  if (!keyFor(provider)) {
    const which = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
    return json({
      error: `${provider === "gemini" ? "Gemini" : "Claude"} is not configured yet. Add the ${which} secret to this Supabase project (Edge Functions → Manage secrets) to enable it.`,
      code: "NO_KEY",
    }, 503);
  }

  try {
    if (body.action === "categorize") return json(await categorize(body, provider));
    if (body.action === "ocr") return json(await ocr(body, provider));
    if (body.action === "contract") return json(await contract(body, provider));
    if (body.action === "analyze") return json(await analyze(body, provider));
    if (body.action === "ask") return json(await ask(body, provider));
    return json({ error: "Unknown action: " + body.action }, 400);
  } catch (e) {
    return json({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
