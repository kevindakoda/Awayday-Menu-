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
      preferredItem: r.preferred_item,
      contractedItem: r.contracted_item,
      notes: r.notes,
    });
  }
  const brandToRow = (b) => ({ code: b.code, shop_name: b.shopName || "", region: b.region || "" });
  const rowToBrand = (r) => ({ shopName: r.shop_name || "", code: r.code, region: r.region || "" });

  /* ----------------------------- reads ------------------------------- */
  async function loadAll() {
    const c = client();
    if (!c) return { loaded: false };
    const [brandsRes, skusRes] = await Promise.all([
      c.from("procurement_brands").select("*"),
      c.from("procurement_skus").select("*"),
    ]);
    if (brandsRes.error) throw brandsRes.error;
    if (skusRes.error) throw skusRes.error;
    P.SHOPS.length = 0;
    (brandsRes.data || []).forEach((r) => P.SHOPS.push(rowToBrand(r)));
    P.SKUS.length = 0;
    (skusRes.data || []).forEach((r) => P.SKUS.push(rowToSku(r)));
    return { loaded: true, brands: P.SHOPS.length, skus: P.SKUS.length };
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

  window.Store = { available, loadAll, pushAll, upsertSku, deleteSku };
})();
