/* =====================================================================
   AI client wrapper. Talks to the Supabase `ai-assist` Edge Function, which
   proxies to Claude server-side (the API key never ships in this static app).
   Falls back to the offline rule-based categorizer when Claude is unavailable.
   ===================================================================== */
(function () {
  "use strict";
  const P = window.PSP;

  function client() {
    return (window.Auth && window.Auth.client) ? window.Auth.client() : null;
  }

  // Provider preference (which model backend the edge function should use).
  // Stored per-browser; the actual API keys live server-side as Supabase
  // secrets, so switching providers never exposes a key.
  const PROVIDER_KEY = "psp_ai_provider";
  function getProvider() {
    try { return localStorage.getItem(PROVIDER_KEY) === "gemini" ? "gemini" : "claude"; } catch (_) { return "claude"; }
  }
  function setProvider(p) {
    try { localStorage.setItem(PROVIDER_KEY, p === "gemini" ? "gemini" : "claude"); } catch (_) { /* ignore */ }
  }
  // Ask the edge function which providers actually have a key configured.
  async function providers() {
    const res = await invoke("providers", {});
    return res.providers || { claude: false, gemini: false };
  }

  // Allowed taxonomy passed to Claude so it classifies into our categories.
  function taxonomy() {
    const t = {};
    Object.keys(P.SUBCATEGORIES).forEach((c) => { t[c] = P.SUBCATEGORIES[c]; });
    return t;
  }

  async function invoke(action, payload) {
    const c = client();
    if (!c) throw new Error("You must be signed in to use AI features.");
    const { data, error } = await c.functions.invoke("ai-assist", {
      body: Object.assign({ action, provider: getProvider() }, payload),
    });
    if (error) {
      let msg = error.message || "AI request failed.";
      // Edge function returns a JSON { error } body on non-2xx; surface it.
      try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  // Categorize an array of free-text product strings. Returns an array aligned
  // to the input order: [{ category, subcategory, qualityTier, confidence }].
  async function categorize(texts) {
    const out = new Array(texts.length).fill(null);
    const CHUNK = 40;
    for (let i = 0; i < texts.length; i += CHUNK) {
      const items = texts.slice(i, i + CHUNK).map((text, j) => ({ index: i + j, text }));
      const res = await invoke("categorize", { items, taxonomy: taxonomy() });
      (res.items || []).forEach((r) => {
        if (typeof r.index === "number" && r.index >= 0 && r.index < out.length) out[r.index] = r;
      });
    }
    return out;
  }

  // OCR a photographed/scanned/PDF price list. Returns extracted line items.
  async function ocr(file) {
    const { mediaType, data } = await toBase64(file);
    const res = await invoke("ocr", { mediaType, data, taxonomy: taxonomy() });
    return res.items || [];
  }

  // Extract a vendor price book from a contract / rate sheet (image or PDF).
  // Returns { vendorName, title, effectiveDate, expirationDate, items: [...] }.
  async function contractExtract(file) {
    const { mediaType, data } = await toBase64(file);
    return await invoke("contract", { mediaType, data, taxonomy: taxonomy() });
  }

  // Generate an executive savings briefing from aggregate stats.
  async function analyze(stats) {
    const res = await invoke("analyze", { stats });
    return res.text || "";
  }

  // Ask a natural-language question grounded in portal data (KAI / RAI / DAI).
  // `context` is a compact object/string of pre-aggregated data — never raw secrets.
  async function ask(question, context) {
    const res = await invoke("ask", { question, context });
    return res.text || "";
  }

  // Build a bounded, model-friendly snapshot of the live catalog. Sends
  // roll-ups (small) plus the highest-spend SKUs (capped) so answers stay
  // grounded without shipping all rows. Returns a plain object.
  function snapshot(opts) {
    opts = opts || {};
    const cap = opts.cap || 300;
    const skus = P.SKUS || [];
    const totals = P.aggregate(skus);

    const rollup = (keyFn) => {
      const m = {};
      skus.forEach((s) => {
        const k = keyFn(s) || "—";
        const r = m[k] || (m[k] = { baseline: 0, savings: 0, skus: 0 });
        r.baseline += s.currentAnnualSpend; r.savings += s.annualSavings; r.skus++;
      });
      return Object.keys(m).map((k) => ({
        name: k, baselineSpend: Math.round(m[k].baseline),
        savings: Math.round(m[k].savings), skuCount: m[k].skus,
      })).sort((a, b) => b.baselineSpend - a.baselineSpend);
    };

    const top = skus.slice().sort((a, b) => b.currentAnnualSpend - a.currentAnnualSpend).slice(0, cap)
      .map((s) => ({
        sku: s.sku, name: s.productName, category: s.categoryGroup, sub: s.subcategory,
        shop: s.shop, vendor: s.currentVendor, recVendor: s.recommendedVendor,
        cur: s.currentUnitPrice, new: s.newUnitPrice, qty: s.annualQuantity,
        annualSpend: s.currentAnnualSpend, annualSavings: s.annualSavings,
      }));

    return {
      generatedAt: new Date().toISOString().slice(0, 10),
      totals: {
        baselineSpend: totals.baselineSpend, newSpend: totals.newSpend,
        savingsOpportunity: totals.savingsOpportunity, savingsPercentage: totals.savingsPercentage,
        skuCount: totals.skuCount, shopCount: (P.SHOPS || []).length,
      },
      byCategory: rollup((s) => s.categoryGroup),
      byShop: rollup((s) => s.shop),
      byRecommendedVendor: rollup((s) => s.recommendedVendor),
      contracts: (P.CONTRACTS || []).map((c) => ({ vendor: c.vendorName, title: c.title, items: (c.items || []).length })),
      topSkusBySpend: top,
      note: skus.length > cap ? `topSkusBySpend lists the ${cap} highest-spend of ${skus.length} SKUs; roll-ups cover all rows.` : "topSkusBySpend covers all SKUs.",
    };
  }

  // Smart spend ingestion (any format). For a document (PDF/image) or free
  // text, Claude extracts normalized, dated spend line items.
  async function extractSpend(input) {
    const payload = input.file
      ? await toBase64(input.file)
      : { text: String(input.text || "") };
    const res = await invoke("spend", Object.assign({ taxonomy: taxonomy() }, payload));
    return res.items || [];
  }

  // Ask Claude to map an arbitrary table's columns to our schema. `samples`
  // are a handful of data rows (arrays). Returns { date, shop, ... , dateFormat }.
  async function mapColumns(header, samples) {
    const res = await invoke("mapcols", { header, samples });
    return res.mapping || {};
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result);
        resolve({ mediaType: file.type || "application/octet-stream", data: s.slice(s.indexOf(",") + 1) });
      };
      r.onerror = () => reject(new Error("Could not read the file."));
      r.readAsDataURL(file);
    });
  }

  // Offline fallback using the built-in keyword categorizer (no network).
  function categorizeLocal(texts) {
    return texts.map((t) => {
      const c = P.categorize(t);
      return {
        category: c.category,
        subcategory: c.subcategory,
        qualityTier: c.qualityTier,
        confidence: (c.confidence || "Low").split(" ")[0],
      };
    });
  }

  window.AI = { categorize, ocr, contractExtract, analyze, ask, snapshot, extractSpend, mapColumns, categorizeLocal, taxonomy, getProvider, setProvider, providers };
})();
