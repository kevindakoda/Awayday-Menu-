/* =====================================================================
   Persistence layer. Syncs the in-memory model (PSP.SHOPS / PSP.SKUS) with
   the Supabase `procurement_brands` and `procurement_skus` tables so that
   uploads and admin edits survive reloads and are shared across users.

   Reads are allowed for any signed-in user; writes are gated to Procurement
   Admins by RLS (and by the UI). When Supabase is unavailable the app simply
   runs in-memory for the session.
   ===================================================================== */
(function () {
  "use strict";
  const P = window.PSP;

  function client() {
    return (window.Auth && window.Auth.client) ? window.Auth.client() : null;
  }
  function available() { return !!client(); }

  /* ----------------------------- mapping ----------------------------- */
  function skuToRow(s) {
    return {
      id: s.id,
      sku: s.sku || "",
      product_name: s.productName || "",
      description: s.description || "",
      category: s.category || "Other",
      subcategory: s.subcategory || "Miscellaneous",
      current_vendor: s.currentVendor || "",
      recommended_vendor: s.recommendedVendor || "",
      current_unit_price: +s.currentUnitPrice || 0,
      new_unit_price: +s.newUnitPrice || 0,
      unit_of_measure: s.unitOfMeasure || "Each",
      pack_size: s.packSize || "",
      annual_quantity: Math.round(+s.annualQuantity || 0),
      shop: s.shop || "",
      shop_code: s.shopCode || "",
      region: s.region || "",
      quality_tier: s.qualityTier || "Standard",
      implementation_status: s.implementationStatus || "Not Reviewed",
      review_owner: s.reviewOwner || "",
      target_date: s.targetDate || "",
      preferred_item: !!s.preferredItem,
      contracted_item: !!s.contractedItem,
      image_url: s.imageUrl || "",
      notes: s.notes || "",
    };
  }
  function rowToSku(r) {
    // Run through makeSku so computed spend/savings fields are populated.
    return P.makeSku({
      id: r.id,
      sku: r.sku,
      productName: r.product_name,
      description: r.description,
      category: r.category,
      subcategory: r.subcategory,
      currentVendor: r.current_vendor,
      recommendedVendor: r.recommended_vendor,
      currentUnitPrice: r.current_unit_price,
      newUnitPrice: r.new_unit_price,
      unitOfMeasure: r.unit_of_measure,
      packSize: r.pack_size,
      annualQuantity: r.annual_quantity,
      shop: r.shop,
      shopCode: r.shop_code,
      region: r.region,
      qualityTier: r.quality_tier,
      implementationStatus: r.implementation_status,
      reviewOwner: r.review_owner,
      targetDate: r.target_date,
      preferredItem: r.preferred_item,
      contractedItem: r.contracted_item,
      notes: r.notes,
    });
  }
  const brandToRow = (b) => ({ code: b.code, shop_name: b.shopName || "", region: b.region || "" });
  const rowToBrand = (r) => ({ shopName: r.shop_name || "", code: r.code, region: r.region || "" });

  const contractToRow = (c) => ({
    id: c.id,
    vendor_name: c.vendorName || "",
    title: c.title || "",
    effective_date: c.effectiveDate || "",
    expiration_date: c.expirationDate || "",
    source: c.source || "",
    items: c.items || [],
  });
  const rowToContract = (r) => ({
    id: r.id,
    vendorName: r.vendor_name || "",
    title: r.title || "",
    effectiveDate: r.effective_date || "",
    expirationDate: r.expiration_date || "",
    source: r.source || "",
    uploadedAt: r.created_at || "",
    items: Array.isArray(r.items) ? r.items : [],
  });

  const apToRow = (a) => ({
    id: a.id,
    shop: a.shop || "", shop_code: a.shopCode || "", region: a.region || "",
    category: a.category || "Other", subcategory: a.subcategory || "",
    vendor: a.vendor || "", invoice_date: a.date || null, sku: a.sku || "",
    amount: +a.amount || 0, quantity: +a.quantity || 0, description: a.description || "",
  });
  const rowToAp = (r) => P.makeApRow({
    id: r.id, date: r.invoice_date, shop: r.shop, shopCode: r.shop_code, region: r.region,
    category: r.category, subcategory: r.subcategory, vendor: r.vendor, sku: r.sku,
    amount: r.amount, quantity: r.quantity, description: r.description,
  });

  /* ----------------------------- reads ------------------------------- */
  async function loadAll() {
    const c = client();
    if (!c) return { loaded: false };
    const [brandsRes, skusRes, contractsRes, apRes, marketRes, snapRes] = await Promise.all([
      c.from("procurement_brands").select("*"),
      c.from("procurement_skus").select("*"),
      c.from("procurement_contracts").select("*"),
      c.from("procurement_ap_spend").select("*"),
      c.from("market_insights").select("*").order("week_of", { ascending: false }).limit(12),
      c.from("savings_snapshots").select("*").order("snapshot_date", { ascending: true }).limit(120),
    ]);
    if (brandsRes.error) throw brandsRes.error;
    if (skusRes.error) throw skusRes.error;
    P.SHOPS.length = 0;
    (brandsRes.data || []).forEach((r) => P.SHOPS.push(rowToBrand(r)));
    P.SKUS.length = 0;
    (skusRes.data || []).forEach((r) => P.SKUS.push(rowToSku(r)));
    // Contracts are optional; ignore a missing-table error so older projects still load.
    if (P.CONTRACTS) {
      P.CONTRACTS.length = 0;
      if (!contractsRes.error) (contractsRes.data || []).forEach((r) => P.CONTRACTS.push(rowToContract(r)));
    }
    // AP spend is optional too (older projects may not have the table yet).
    if (P.AP) {
      P.apClear();
      if (!apRes.error) (apRes.data || []).forEach((r) => P.AP.push(rowToAp(r)));
    }
    // Market insights (optional table).
    if (P.MARKET) {
      P.MARKET.length = 0;
      if (!marketRes.error) (marketRes.data || []).forEach((r) => P.MARKET.push({
        id: r.id, weekOf: r.week_of, asOf: r.as_of, text: r.text || "",
        sources: Array.isArray(r.sources) ? r.sources : [],
      }));
    }
    // Savings snapshots (optional table).
    if (P.SNAPSHOTS) {
      P.SNAPSHOTS.length = 0;
      if (!snapRes.error) (snapRes.data || []).forEach((r) => P.SNAPSHOTS.push({
        date: r.snapshot_date, identified: +r.identified || 0, approved: +r.approved || 0,
        implemented: +r.implemented || 0, baseline: +r.baseline || 0,
      }));
    }
    return { loaded: true, brands: P.SHOPS.length, skus: P.SKUS.length, ap: (P.AP || []).length };
  }

  /* ----------------------------- writes ------------------------------ */
  async function insertChunked(table, rows) {
    const c = client();
    for (let i = 0; i < rows.length; i += 500) {
      const res = await c.from(table).insert(rows.slice(i, i + 500));
      if (res.error) throw res.error;
    }
  }

  // Full replace: make the DB mirror the current in-memory state. Used after
  // imports, sample-load, clear, and brand renames (which fan out to SKUs).
  async function pushAll() {
    const c = client();
    if (!c) return;
    let res = await c.from("procurement_skus").delete().not("id", "is", null);
    if (res.error) throw res.error;
    res = await c.from("procurement_brands").delete().not("code", "is", null);
    if (res.error) throw res.error;
    if (P.SHOPS.length) await insertChunked("procurement_brands", P.SHOPS.map(brandToRow));
    if (P.SKUS.length) await insertChunked("procurement_skus", P.SKUS.map(skuToRow));
  }

  // Single-row upsert for one SKU edit/add.
  async function upsertSku(sku) {
    const c = client();
    if (!c) return;
    const res = await c.from("procurement_skus").upsert(skuToRow(sku));
    if (res.error) throw res.error;
  }

  async function deleteSku(id) {
    const c = client();
    if (!c) return;
    const res = await c.from("procurement_skus").delete().eq("id", id);
    if (res.error) throw res.error;
  }

  // Save a single contract price book (insert or update).
  async function upsertContract(contract) {
    const c = client();
    if (!c) return;
    const res = await c.from("procurement_contracts").upsert(contractToRow(contract));
    if (res.error) throw res.error;
  }

  async function deleteContract(id) {
    const c = client();
    if (!c) return;
    const res = await c.from("procurement_contracts").delete().eq("id", id);
    if (res.error) throw res.error;
  }

  // Full replace: mirror the in-memory AP spend into the database.
  async function pushAp() {
    const c = client();
    if (!c) return;
    const del = await c.from("procurement_ap_spend").delete().not("id", "is", null);
    if (del.error) throw del.error;
    if (P.AP && P.AP.length) await insertChunked("procurement_ap_spend", P.AP.map(apToRow));
  }

  // Save (upsert) one weekly market briefing and mirror it into P.MARKET.
  async function saveMarket(brief) {
    const c = client();
    if (!c) return;
    const week = P.weekOf(brief.asOf);
    const row = { id: "MI-" + week, week_of: week, as_of: brief.asOf || new Date().toISOString(), text: brief.text || "", sources: brief.sources || [] };
    const res = await c.from("market_insights").upsert(row, { onConflict: "id" });
    if (res.error) throw res.error;
    if (P.MARKET) {
      const entry = { id: row.id, weekOf: week, asOf: row.as_of, text: row.text, sources: row.sources };
      const i = P.MARKET.findIndex((m) => m.id === row.id);
      if (i >= 0) P.MARKET[i] = entry; else P.MARKET.unshift(entry);
      P.MARKET.sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
    }
  }

  // Capture today's savings funnel as a snapshot (idempotent per day).
  async function saveSnapshot() {
    const c = client();
    if (!c) return null;
    const f = P.savingsFunnel();
    const date = new Date().toISOString().slice(0, 10);
    const row = { snapshot_date: date, identified: f.identified, approved: f.approved, implemented: f.realized, baseline: f.baseline };
    const res = await c.from("savings_snapshots").upsert(row, { onConflict: "snapshot_date" });
    if (res.error) throw res.error;
    if (P.SNAPSHOTS) {
      const entry = { date, identified: f.identified, approved: f.approved, implemented: f.realized, baseline: f.baseline };
      const i = P.SNAPSHOTS.findIndex((s) => s.date === date);
      if (i >= 0) P.SNAPSHOTS[i] = entry; else P.SNAPSHOTS.push(entry);
      P.SNAPSHOTS.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    return date;
  }

  window.Store = { available, loadAll, pushAll, pushAp, saveMarket, saveSnapshot, upsertSku, deleteSku, upsertContract, deleteContract };
})();
