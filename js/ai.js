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

  window.AI = { categorize, ocr, contractExtract, analyze, categorizeLocal, taxonomy, getProvider, setProvider, providers };
})();
