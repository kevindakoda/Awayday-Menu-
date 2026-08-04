/* =====================================================================
   Page renderers. Each page exposes render(params) -> html and an
   optional mount(params) for event wiring. Registered on window.PAGES.
   ===================================================================== */
(function () {
  "use strict";
  const P = window.PSP;
  const U = window.UI;
  const { fmt } = P;
  const esc = U.esc;
  // Safe max: avoids Math.max(...[]) === -Infinity when the catalog is empty.
  const mx = (arr) => (arr.length ? Math.max(...arr) : 0);
  // Friendly empty-state block shown on data pages before anything is uploaded.
  const emptyState = (msg) => `<div class="card" style="text-align:center;padding:40px 20px">
    <div style="font-size:34px;margin-bottom:8px">📭</div>
    <h3 style="margin:0 0 6px">No data yet</h3>
    <p class="text-muted" style="max-width:440px;margin:0 auto 14px">${msg || "Upload brands and products in the Admin tab to populate the portal."}</p>
    <a class="btn btn-primary btn-sm" href="#/admin">Go to Admin → upload</a>
  </div>`;

  // Shared, in-memory UI state (filters, selections) persisted across renders.
  const State = (window.AppState = window.AppState || {
    catalog: { search: "", category: "", subcategory: "", shop: "", vendor: "", status: "", minSavingsPct: 0, preferred: false, contracted: false, sort: "annualSavings", dir: "desc" },
    savingsView: "Category",
    comparePair: 0,
    shopTab: "Overview",
    contractSearch: "",
    role: "Procurement Admin",
  });

  const PAGES = (window.PAGES = {});

  /* ---------------- Shared smart spend ingestion (any format) ----------------
     Reads CSV/XLSX (every tab), PDF/image, or text into AP spend. For
     workbooks it processes EACH sheet on its own — only sheets that look like
     line-item spend (amount + item + date/period) are imported, so summary /
     order-total / defect tabs are skipped and never double-count. `opts.vendor`
     stamps the report's vendor onto rows that don't carry one. */
  async function ingestSpendFile(file, opts) {
    opts = opts || {};
    const name = (file.name || "").toLowerCase();
    const isDoc = /\.(pdf|png|jpe?g)$/.test(name) || /^(image|application\/pdf)/.test(file.type || "");
    const isText = /\.(txt|tsv)$/.test(name) && !/csv/.test(file.type || "");
    const aiReady = window.AI && window.Store && window.Store.available();
    if (isDoc) return Object.assign(P.ingestApItems(await window.AI.extractSpend({ file }), opts), { sheets: ["document"] });
    if (isText) return Object.assign(P.ingestApItems(await window.AI.extractSpend({ text: await file.text() }), opts), { sheets: ["text"] });

    let sheets = [];
    if (name.endsWith(".csv") || file.type === "text/csv") {
      sheets = [{ name: "CSV", rows: P.parseCsv(await file.text()) }];
    } else {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      sheets = wb.SheetNames.map((sn) => ({ name: sn, rows: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" }) }));
    }
    let added = 0; const used = [];
    for (const sh of sheets) {
      const rows = sh.rows; if (!rows || rows.length < 2) continue;
      const hdr = (rows[0] || []).map((h) => String(h == null ? "" : h).toLowerCase());
      const has = (...ns) => hdr.some((h) => ns.some((n) => h === n || h.includes(n)));
      const amountish = has("ext_price", "ext price", "extended", "amount", "spend", "sales", "total", "value");
      const itemish = has("sku", "description", "item", "category");
      const dateish = has("date", "period", "month");
      if (!(amountish && itemish && dateish)) continue;
      let mapping = null;
      if (aiReady) { try { mapping = await window.AI.mapColumns(rows[0], rows.slice(1, 25)); } catch (_) { mapping = null; } }
      const r = P.ingestApRows(rows, mapping, opts);
      if (r.added) { added += r.added; used.push(sh.name + " (" + r.added + ")"); }
    }
    return { added, sheets: used };
  }

  /* Render a PDF's pages to JPEG images (base64) in the browser — used to OCR
     encrypted / image-only / signed PDFs that have no extractable text layer. */
  async function pdfToImages(file, cap, onProgress) {
    if (!window.pdfjsLib) return [];
    try { if (window.pdfjsLib.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (_) { /* ignore */ }
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = Math.min(pdf.numPages, cap || 40);
    const out = [];
    for (let i = 1; i <= n; i++) {
      if (onProgress) onProgress(i, n);
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1500 / base.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      out.push({ mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    }
    return out;
  }

  /* ============================== DASHBOARD ============================== */
  PAGES.dashboard = {
    title: "Dashboard",
    crumb: "Dashboard",
    render() {
      const cats = P.categoryGroups();
      const dq = P.dataQuality();
      const totals = P.aggregate(P.SKUS);
      const vendorCount = P.VENDORS.length;
      const shops = P.shops();
      const opps = P.opportunities();
      const maxCatSavings = mx(cats.map((c) => c.savingsOpportunity));
      const maxShopSavings = mx(shops.map((s) => s.savingsOpportunity));

      const kpis = [
        U.statCard({ label: "Baseline Spend", value: fmt.money(totals.baselineSpend), accent: "navy", icon: "💵", iconBg: "var(--navy-50)" }),
        U.statCard({ label: "Negotiated Spend", value: fmt.money(totals.newSpend), accent: "blue", icon: "🤝", iconBg: "var(--blue-bg)" }),
        U.statCard({ label: "Savings Opportunity", value: fmt.money(totals.savingsOpportunity), delta: "▼ " + fmt.pct(totals.savingsPercentage) + " vs baseline", accent: "green", icon: "📉", iconBg: "var(--green-bg)" }),
        U.statCard({ label: "Savings Rate", value: fmt.pct(totals.savingsPercentage), accent: "green", icon: "🎯", iconBg: "var(--green-bg)" }),
      ];
      const kpis2 = [
        U.statCard({ label: "SKUs Analyzed", value: fmt.num(totals.skuCount), icon: "📦", iconBg: "var(--gray-100)" }),
        U.statCard({ label: "Vendors Included", value: vendorCount, icon: "🏷️", iconBg: "var(--gray-100)" }),
        U.statCard({ label: "Shops", value: shops.length, icon: "🏬", iconBg: "var(--gray-100)" }),
        U.statCard({ label: "Opportunities", value: opps.length, icon: "✨", iconBg: "var(--gray-100)" }),
      ];

      const catBars = cats.map((c) => U.hbar(c.categoryName, c.savingsOpportunity, maxCatSavings, fmt.moneyShort(c.savingsOpportunity))).join("");
      const shopBars = shops.map((s) => U.hbar(s.code, s.savingsOpportunity, maxShopSavings, fmt.moneyShort(s.savingsOpportunity))).join("");

      const adoptionRows = shops.map((s) => `<tr>
        <td><span class="cell-strong">${esc(s.shopName)}</span><div class="cell-sub">${esc(s.code)} · ${esc(s.region)}</div></td>
        <td>${esc(s.region)}</td>
        <td class="num">${fmt.money(s.baselineSpend)}</td>
        <td class="num text-green">${fmt.money(s.savingsOpportunity)}</td>
        <td class="num">${fmt.pct(s.savingsPercentage)}</td>
        <td>${U.statusBadge(s.implementationStatus)}</td>
      </tr>`).join("");

      const topOpps = opps.slice(0, 6).map((o) => `<tr class="row-link" onclick="location.hash='#/savings'">
        <td><span class="cell-strong">${esc(o.subcategory)}</span><div class="cell-sub">${esc(o.category)} · ${esc(o.shopCode)}</div></td>
        <td>${esc(o.recommendedSupplier)}</td>
        <td class="num text-green cell-strong">${fmt.money(o.annualSavings)}</td>
        <td>${U.savingsBadge(o.savingsPercentage)}</td>
        <td>${(o.badges[0] ? U.oppBadge(o.badges[0]) : "")}</td>
      </tr>`).join("");

      // Implementation status distribution
      const statusDist = {};
      P.SKUS.forEach((s) => { statusDist[s.implementationStatus] = (statusDist[s.implementationStatus] || 0) + 1; });
      const distOrder = ["Not Reviewed", "In Review", "Approved", "Implemented", "Deferred", "Rejected"];
      const distHtml = distOrder.filter((k) => statusDist[k]).map((k) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gray-100)">
          ${U.statusBadge(k)} <span class="cell-strong">${statusDist[k]} SKUs</span></div>`).join("");

      return `
      <div class="page-head hero">
        <div class="hero-eyebrow">⚓ Procurement Command Center</div>
        <h1>Procurement Savings Portal</h1>
        <p>A centralized view of decentralized purchasing across products, SKUs, vendors, and shops — tracking baseline pricing, negotiated pricing, and the savings still on the table.</p>
        <div class="hero-stats">
          <div><div class="hs-num">${fmt.money(totals.savingsOpportunity)}</div><div class="hs-lbl">Identified savings</div></div>
          <div class="hs-div"></div>
          <div><div class="hs-num" style="color:#9fe0cb">${fmt.pct(totals.savingsPercentage)}</div><div class="hs-lbl">vs. baseline spend</div></div>
          <div class="hs-div"></div>
          <div><div class="hs-num">${fmt.num(opps.length)}</div><div class="hs-lbl">Open opportunities</div></div>
        </div>
      </div>

      ${P.SKUS.length ? "" : `<div class="notice" style="margin-bottom:18px">📭 No data loaded yet. Head to the <a href="#/admin">Admin tab</a> to upload an Excel of products, OCR a price list, or load the sample dataset.</div>`}

      <div class="grid cols-4">${kpis.join("")}</div>
      <div class="grid cols-4" style="margin-top:16px">${kpis2.join("")}</div>

      ${P.SKUS.length && (dq.counts.negative + dq.counts.missingPrice + dq.counts.missingQty + dq.counts.outliers) ? `
      <div class="card" style="margin-top:18px;border-left:3px solid var(--amber, #d97706)">
        <h3 class="card-title">🔎 Data quality &amp; anomalies</h3>
        <div class="tag-cats" style="margin-bottom:10px">
          <span class="badge red">${dq.counts.negative} price increase(s)</span>
          <span class="badge amber">${dq.counts.missingPrice} missing price</span>
          <span class="badge amber">${dq.counts.missingQty} missing qty</span>
          <span class="badge navy">${dq.counts.outliers} price outlier(s)</span>
        </div>
        ${dq.negative.length ? `<div class="cell-sub" style="margin-bottom:4px">Negotiated price is <b>higher</b> than current (renegotiate or re-check):</div>
        <div class="table-wrap" style="border:none"><table class="data" style="min-width:560px"><thead><tr><th>SKU</th><th>Shop</th><th class="num">Now/ea</th><th class="num">New/ea</th><th class="num">Annual impact</th></tr></thead><tbody>${dq.negative.slice(0, 6).map((s) => `<tr class="row-link" onclick="location.hash='#/comparison/${s.id}'"><td class="cell-sub">${esc(s.productName)}</td><td>${esc(s.shop || "—")}</td><td class="num">${fmt.money(s.currentUnitPrice, 2)}</td><td class="num text-red">${fmt.money(s.newUnitPrice, 2)}</td><td class="num text-red">${fmt.money((s.newUnitPrice - s.currentUnitPrice) * s.annualQuantity)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </div>` : ""}

      <div class="section-title">Category Breakdown</div>
      <div class="grid cols-4">${cats.map(U.categoryTile).join("")}</div>

      <div class="grid cols-2" style="margin-top:22px">
        <div class="card"><h3 class="card-title">📊 Savings by Category</h3>${U.donut(cats.map((c) => ({ label: c.categoryName, value: c.savingsOpportunity, color: c.color })))}</div>
        <div class="card"><h3 class="card-title">🏬 Savings by Shop</h3>${shopBars}</div>
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <h3 class="card-title">🏆 Top Opportunities</h3>
          <div class="table-wrap" style="border:none">
            <table class="data" style="min-width:520px"><thead><tr>
              <th>Opportunity</th><th>Recommended Vendor</th><th class="num">Annual Savings</th><th>Savings</th><th>Flag</th>
            </tr></thead><tbody>${topOpps}</tbody></table>
          </div>
        </div>
        <div class="card"><h3 class="card-title">📌 Implementation Status</h3>${distHtml}</div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 class="card-title">✅ Shop Adoption Status</h3>
        <div class="table-wrap" style="border:none">
          <table class="data"><thead><tr>
            <th>Shop</th><th>Region</th><th class="num">Baseline</th><th class="num">Savings</th><th class="num">Rate</th><th>Status</th>
          </tr></thead><tbody>${adoptionRows}</tbody></table>
        </div>
      </div>`;
    },
  };

  /* ============================== CATEGORIES ============================== */
  PAGES.categories = {
    title: "Categories",
    crumb: "Categories",
    render(params) {
      // Tiles are the broad category groups (Linens, Disposables, …); detailed
      // categories (Bath Linens, Bed Linens) appear when you drill in.
      const groups = P.categoryGroups();
      const active = params[0] ? decodeURIComponent(params[0]) : null;
      if (!active) {
        const tiles = groups.length ? groups.map(U.categoryTile).join("") : P.categories().map(U.categoryTile).join("");
        return `<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div><h1>Category Menu</h1><p>Select a category to drill into its detailed categories, savings, and recommended suppliers.</p></div>
            <button class="btn btn-green btn-sm" id="dlCatReport">⬇ Savings report (by category)</button>
          </div>
          <div class="grid cols-3">${tiles}</div>`;
      }
      const meta = P.CATEGORY_META[active] || { icon: "📦", color: "var(--navy)" };
      const detail = P.categoriesInGroup(active);
      const pills = groups.map((g) => `<a class="pill ${g.categoryName === active ? "active" : ""}" href="#/categories/${encodeURIComponent(g.categoryName)}">${g.icon} ${esc(g.categoryName)}</a>`).join("");

      const subCards = detail.length ? detail.map((s) => `
        <div class="card" style="border-top:3px solid ${meta.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <h3 class="card-title" style="margin-bottom:4px">${esc(s.categoryName)}</h3>
            ${U.savingsBadge(s.savingsPercentage)}
          </div>
          <div class="card-sub">${s.skuCount} SKU${s.skuCount !== 1 ? "s" : ""} · ${esc(s.recommendedSupplier)}</div>
          <div class="kv-grid" style="margin:12px 0">
            <span class="k">Current spend</span><span class="v">${fmt.money(s.baselineSpend)}</span>
            <span class="k">New spend</span><span class="v">${fmt.money(s.newSpend)}</span>
            <span class="k">Savings</span><span class="v text-green">${fmt.money(s.savingsOpportunity)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--gray-100);padding-top:11px">
            ${U.statusBadge(s.status)}
            <a class="btn btn-outline btn-sm" href="#/catalog?category=${encodeURIComponent(s.categoryName)}">View SKUs →</a>
          </div>
        </div>`).join("") : `<div class="empty">No SKUs loaded for ${esc(active)} yet.</div>`;

      return `
        <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div><h1>${meta.icon} ${esc(active)}</h1><p>Detailed categories under ${esc(active)}. Each card shows current vs. negotiated spend, savings, and review status.</p></div>
          <button class="btn btn-green btn-sm" id="dlCatReport" data-cat="${esc(active)}">⬇ Savings report (${esc(active)})</button>
        </div>
        <div class="pillbar">${pills}</div>
        <div class="grid cols-3">${subCards}</div>`;
    },
    mount() {
      const b = document.getElementById("dlCatReport");
      if (!b) return;
      b.addEventListener("click", () => {
        const grp = b.getAttribute("data-cat");
        const rows = grp ? P.SKUS.filter((s) => s.categoryGroup === grp) : P.SKUS;
        if (!rows.length) { alert("No SKUs to report yet — upload data first."); return; }
        const fname = grp ? "savings-" + grp.replace(/\s+/g, "-").toLowerCase() + ".csv" : "savings-by-category.csv";
        downloadCsv(categorySavingsReportCsv(rows), fname);
      });
    },
  };

  /* ========================= CONTRACT REPOSITORY ========================= */
  // Days until a date string (YYYY-MM-DD or parseable); null if unparseable.
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr.length <= 10 ? dateStr + "T00:00:00" : dateStr);
    if (isNaN(+d)) return null;
    return Math.round((d - new Date()) / 86400000);
  }
  function contractStatus(c) {
    const dleft = daysUntil(c.expirationDate);
    if (dleft == null) return { key: "none", label: "No end date", cls: "navy" };
    if (dleft < 0) return { key: "expired", label: "Expired", cls: "red" };
    if (dleft <= 90) return { key: "expiring", label: `Expires in ${dleft}d`, cls: "amber" };
    return { key: "active", label: "Active", cls: "green" };
  }
  function contractItemsTotal(c) { return (c.items || []).length; }
  function filteredContracts() {
    const q = (State.contractSearch || "").trim().toLowerCase();
    let list = (P.CONTRACTS || []).slice();
    if (q) list = list.filter((c) => (`${c.vendorName} ${c.title} ${c.source} ${(c.items || []).map((i) => i.category + " " + i.name).join(" ")}`).toLowerCase().includes(q));
    // Expiring soonest first; contracts with no end date sink to the bottom.
    return list.sort((a, b) => {
      const da = daysUntil(a.expirationDate), db = daysUntil(b.expirationDate);
      if (da == null && db == null) return (a.vendorName || "").localeCompare(b.vendorName || "");
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  PAGES.contracts = {
    title: "Contract Repository",
    crumb: "Contract Repository",
    render(params) {
      const canEdit = State.role === "Procurement Admin";
      const all = P.CONTRACTS || [];
      const id = params[0] ? decodeURIComponent(params[0]) : null;
      if (id) return contractDetail(id, canEdit);

      const head = `<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div><h1>📑 Contract Repository</h1><p>Every vendor contract & rate sheet in one place — with effective dates, expirations, and the price book extracted from each.</p></div>
          ${canEdit ? `<a class="btn btn-primary btn-sm" href="#/admin">⬆ Upload a contract</a>` : ""}
        </div>`;

      if (!all.length) {
        return `${head}<div class="card" style="text-align:center;padding:40px 20px">
          <div style="font-size:34px;margin-bottom:8px">📑</div>
          <h3 style="margin:0 0 6px">No contracts yet</h3>
          <p class="text-muted" style="max-width:460px;margin:0 auto 14px">${canEdit ? "Upload a vendor contract, rate sheet, or pricing schedule on the Admin tab. The AI reads it and builds a searchable price book here." : "A Procurement Admin uploads contracts and rate sheets here."}</p>
          ${canEdit ? `<a class="btn btn-primary btn-sm" href="#/admin">Go to Admin → upload contract</a>` : ""}
        </div>`;
      }

      const vendorsWithContracts = new Set(all.map((c) => (c.vendorName || "").toLowerCase())).size;
      const totalItems = all.reduce((a, c) => a + contractItemsTotal(c), 0);
      const expiring = all.filter((c) => contractStatus(c).key === "expiring").length;
      const expired = all.filter((c) => contractStatus(c).key === "expired").length;

      const rows = filteredContracts().map((c) => {
        const st = contractStatus(c);
        const m = P.matchContractToSkus(c);
        return `<tr class="row-link" data-contract="${esc(c.id)}">
          <td><span class="cell-strong">${esc(c.vendorName || "—")}</span><div class="cell-sub">${esc(c.title || "Untitled")}</div></td>
          <td>${esc(c.effectiveDate || "—")}</td>
          <td>${esc(c.expirationDate || "—")}</td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td class="num">${fmt.num(contractItemsTotal(c))}</td>
          <td class="num ${m.totalSavings > 0 ? "text-green cell-strong" : "cell-sub"}">${m.totalSavings > 0 ? fmt.money(m.totalSavings) : "—"}</td>
          <td class="cell-sub">${esc(c.source || "—")}</td>
        </tr>`;
      }).join("");

      return `${head}
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Contracts", value: fmt.num(all.length), accent: "navy", icon: "📑", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Vendors Covered", value: fmt.num(vendorsWithContracts), accent: "blue", icon: "🏷️", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "Priced Line Items", value: fmt.num(totalItems), accent: "navy", icon: "🧾", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Expiring / Expired", value: `${expiring} / ${expired}`, delta: "within 90 days", deltaClass: "text-muted", accent: "amber", icon: "⏳", iconBg: "var(--amber-bg)" })}
        </div>
        <div class="toolbar">
          <div class="search"><span class="si">🔍</span><input type="text" id="contractSearch" placeholder="Search vendor, title, category…" value="${esc(State.contractSearch || "")}"></div>
        </div>
        <div class="table-wrap">
          <table class="data" style="min-width:760px"><thead><tr>
            <th>Vendor / Contract</th><th>Effective</th><th>Expiration</th><th>Status</th><th class="num">Items</th><th class="num">Matched savings</th><th>Source</th>
          </tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty">No contracts match your search.</div></td></tr>`}</tbody></table>
        </div>`;
    },
    mount(params) {
      const id = params[0] ? decodeURIComponent(params[0]) : null;
      if (id) { mountContractDetail(id); return; }
      const search = document.getElementById("contractSearch");
      if (search) {
        search.addEventListener("input", (e) => { State.contractSearch = e.target.value; debounceRender(); });
        search.focus();
        const v = search.value; search.value = ""; search.value = v;
      }
      document.querySelectorAll("tr[data-contract]").forEach((tr) => tr.addEventListener("click", () => {
        location.hash = "#/contracts/" + encodeURIComponent(tr.getAttribute("data-contract"));
      }));
    },
  };

  function contractDetail(id, canEdit) {
    const c = (P.CONTRACTS || []).find((x) => x.id === id);
    if (!c) return `<div class="page-head"><h1>Contract not found</h1></div><div class="empty"><a href="#/contracts">← Back to repository</a></div>`;
    const st = contractStatus(c);
    const m = P.matchContractToSkus(c);

    // Price book grouped by category.
    const byCat = {};
    (c.items || []).forEach((it) => { (byCat[it.category || "Other"] = byCat[it.category || "Other"] || []).push(it); });
    const bookBlocks = Object.keys(byCat).sort().map((cat) => {
      const rows = byCat[cat].map((it) => `<tr>
        <td><span class="cell-strong">${esc(it.name)}</span>${it.description ? `<div class="cell-sub">${esc(it.description)}</div>` : ""}</td>
        <td>${esc(it.uom || "Each")}${it.packSize ? `<div class="cell-sub">${esc(it.packSize)}</div>` : ""}</td>
        <td class="num cell-strong">${fmt.money(it.unitPrice, 2)}</td>
        <td class="cell-sub">${esc(it.notes || "")}</td>
      </tr>`).join("");
      return `<div style="margin-top:10px"><div class="cell-strong" style="font-size:12.5px;margin-bottom:4px">${esc(cat)} <span class="cell-sub">(${byCat[cat].length})</span></div>
        <div class="table-wrap" style="border:none"><table class="data"><thead><tr><th>Item</th><th>UoM</th><th class="num">Contract price/each</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join("");

    const matchRows = m.matches.slice(0, 25).map((x) => `<tr>
      <td><span class="cell-strong">${esc(x.sku.productName)}</span><div class="cell-sub">${esc(x.sku.shop)} · ${esc(x.sku.sku || x.sku.id)}</div></td>
      <td class="num"><span class="price-old">${fmt.money(x.currentEach, 2)}</span></td>
      <td class="num text-green cell-strong">${fmt.money(x.contractEach, 2)}</td>
      <td class="num ${x.annualSavings > 0 ? "text-green" : "text-red"}">${fmt.money(x.annualSavings)}</td>
    </tr>`).join("");

    const shopOpts = (P.scopedShops ? P.scopedShops() : (P.SHOPS || [])).map((s) => `<option value="${esc(s.shopName)}">${esc(s.shopName)}</option>`).join("");
    const adminBar = canEdit ? `<div class="card" style="margin-bottom:16px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="cell-strong">Publish this price book to a shop's catalog:</span>
        <select id="publishShop" class="approve-select" style="max-width:240px"><option value="">Select shop…</option>${shopOpts}</select>
        <button class="btn btn-primary btn-sm" id="publishBtn">Publish → catalog</button>
        <button class="btn btn-outline btn-sm" id="deleteContract" style="margin-left:auto;color:var(--red);border-color:#f2c4c4">🗑 Delete contract</button>
      </div><div id="publishMsg" class="cell-sub" style="margin-top:8px"></div></div>` : "";

    return `<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><div class="cell-sub"><a href="#/contracts">📑 Contract Repository</a> / ${esc(c.vendorName || "—")}</div>
          <h1 style="margin-top:4px">${esc(c.title || c.vendorName || "Contract")}</h1>
          <p>${esc(c.vendorName || "")} · ${esc(c.source || "uploaded")} · <span class="badge ${st.cls}">${esc(st.label)}</span></p></div>
      </div>
      <div class="grid cols-4" style="margin-bottom:16px">
        ${U.statCard({ label: "Effective", value: c.effectiveDate || "—", accent: "navy" })}
        ${U.statCard({ label: "Expiration", value: c.expirationDate || "—", accent: "amber" })}
        ${U.statCard({ label: "Priced Items", value: fmt.num(contractItemsTotal(c)), accent: "navy" })}
        ${U.statCard({ label: "Matched Savings", value: m.totalSavings > 0 ? fmt.money(m.totalSavings) : "—", delta: m.matchedSkus + " SKUs matched", deltaClass: "text-muted", accent: "green" })}
      </div>
      ${adminBar}
      <div class="card" style="margin-bottom:16px"><h3 class="card-title">📒 Price book</h3>${bookBlocks || `<div class="cell-sub">No priced line items were extracted from this contract.</div>`}</div>
      ${m.matches.length ? `<div class="card"><h3 class="card-title">🎯 Savings vs. current catalog prices <span class="cell-sub">(top ${Math.min(25, m.matches.length)})</span></h3>
        <div class="table-wrap" style="border:none"><table class="data"><thead><tr><th>SKU</th><th class="num">Current/each</th><th class="num">Contract/each</th><th class="num">Annual savings</th></tr></thead><tbody>${matchRows}</tbody></table></div></div>` : ""}`;
  }

  function mountContractDetail(id) {
    const pub = document.getElementById("publishBtn");
    if (pub) pub.addEventListener("click", async () => {
      const shop = (document.getElementById("publishShop") || {}).value || "";
      const msg = document.getElementById("publishMsg");
      if (!shop) { if (msg) msg.innerHTML = `<span class="text-amber">Pick a shop first.</span>`; return; }
      const res = P.publishContractToCatalog(id, shop);
      if (window.Store && window.Store.available()) { try { await window.Store.pushAll(); } catch (_) { /* best effort */ } }
      if (msg) msg.innerHTML = `<span class="text-green">✅ Published ${res.added || 0} item(s) to <b>${esc(shop)}</b>'s catalog.</span>`;
    });
    const del = document.getElementById("deleteContract");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Delete this contract and its price book? This cannot be undone.")) return;
      P.deleteContract(id);
      if (window.Store && window.Store.available()) { try { await window.Store.deleteContract(id); } catch (_) { /* best effort */ } }
      location.hash = "#/contracts";
    });
  }

  /* ============================== SKU CATALOG ============================== */
  function filteredSkus() {
    const f = State.catalog;
    let rows = P.scopedSkus().slice();
    const q = f.search.trim().toLowerCase();
    if (q) rows = rows.filter((s) => (s.id + " " + (s.sku || "") + " " + s.productName + " " + s.currentVendor + " " + s.recommendedVendor + " " + s.category + " " + s.subcategory).toLowerCase().includes(q));
    if (f.category) rows = rows.filter((s) => s.category === f.category);
    if (f.subcategory) rows = rows.filter((s) => s.subcategory === f.subcategory);
    if (f.shop) rows = rows.filter((s) => s.shopCode === f.shop);
    if (f.vendor) rows = rows.filter((s) => s.recommendedVendor === f.vendor || s.currentVendor === f.vendor);
    if (f.status) rows = rows.filter((s) => s.implementationStatus === f.status);
    if (f.minSavingsPct) rows = rows.filter((s) => s.savingsPercentage >= f.minSavingsPct);
    if (f.preferred) rows = rows.filter((s) => s.preferredItem);
    if (f.contracted) rows = rows.filter((s) => s.contractedItem);
    const dir = f.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[f.sort], bv = b[f.sort];
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return rows;
  }

  PAGES.catalog = {
    title: "SKU Catalog",
    crumb: "SKU Catalog",
    render() {
      const f = State.catalog;
      const rows = filteredSkus();
      const scoped = P.scopedSkus();
      const allSubs = Array.from(new Set(scoped.filter((s) => !f.category || s.category === f.category).map((s) => s.subcategory))).sort();
      const opt = (val, label, sel) => `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`;
      const catOpts = [""].concat(P.CATEGORY_ORDER).map((c) => opt(c, c || "All categories", f.category)).join("");
      const subOpts = `<option value="">All subcategories</option>` + allSubs.map((s) => opt(s, s, f.subcategory)).join("");
      const shopOpts = `<option value="">All shops</option>` + P.scopedShops().map((s) => opt(s.code, s.shopName, f.shop)).join("");
      const vendorList = Array.from(new Set(scoped.flatMap((s) => [s.currentVendor, s.recommendedVendor]))).sort();
      const vendorOpts = `<option value="">All vendors</option>` + vendorList.map((v) => opt(v, v, f.vendor)).join("");
      const statusOpts = `<option value="">All statuses</option>` + P.STATUSES.map((s) => opt(s, s, f.status)).join("");

      const sortIcon = (col) => f.sort === col ? (f.dir === "asc" ? " ▲" : " ▼") : "";
      const th = (col, label, cls) => `<th class="sortable ${cls || ""}" data-sort="${col}">${label}${sortIcon(col)}</th>`;

      const body = rows.length ? rows.map((s) => `<tr class="row-link" data-sku="${s.id}">
        <td><span class="mono">${esc(s.sku || s.id)}</span></td>
        <td><div class="prod-img" style="height:34px;width:34px;border-radius:7px;font-size:15px;display:inline-grid;vertical-align:middle">📦</div></td>
        <td>
          <div class="cell-strong">${esc(s.productName)}</div>
          <div class="cell-sub">${esc(s.description)}</div>
          <div style="margin-top:3px">${s.preferredItem ? '<span class="badge blue" style="font-size:10px">★ Preferred</span> ' : ""}${s.contractedItem ? '<span class="badge purple" style="font-size:10px">Contracted</span>' : ""}</div>
        </td>
        <td>${esc(s.category)}<div class="cell-sub">${esc(s.subcategory)}</div></td>
        <td>${esc(s.shopCode)}<div class="cell-sub">${esc(s.region)}</div></td>
        <td>${esc(s.currentVendor)}<div class="cell-sub">→ ${esc(s.recommendedVendor)}</div></td>
        <td class="num"><span class="price-old">${fmt.money(s.currentUnitPrice, 2)}</span><div class="text-green cell-strong">${fmt.money(s.newUnitPrice, 2)}</div></td>
        <td class="num">${esc(s.unitOfMeasure)}<div class="cell-sub">${esc(s.packSize)}</div></td>
        <td class="num">${fmt.num(s.annualQuantity)}</td>
        <td class="num">${fmt.money(s.currentAnnualSpend)}<div class="cell-sub text-green">${fmt.money(s.newAnnualSpend)}</div></td>
        <td class="num cell-strong text-green">${fmt.money(s.annualSavings)}</td>
        <td>${U.savingsBadge(s.savingsPercentage)}</td>
        <td>${U.statusBadge(s.implementationStatus)}</td>
      </tr>`).join("") : `<tr><td colspan="13"><div class="empty">No SKUs match the current filters.</div></td></tr>`;

      return `
      <div class="page-head"><h1>SKU Catalog</h1><p>Search and filter SKU-level pricing across every category, shop, and vendor. Click a row to open the side-by-side comparison.</p></div>
      <div class="layout-split">
        <aside class="filter-panel">
          <h4>Filters <button class="btn-clear" id="clearFilters">Clear all</button></h4>
          <div class="filter-group"><label>Category</label><select data-f="category">${catOpts}</select></div>
          <div class="filter-group"><label>Subcategory</label><select data-f="subcategory">${subOpts}</select></div>
          <div class="filter-group"><label>Shop / Brand</label><select data-f="shop">${shopOpts}</select></div>
          <div class="filter-group"><label>Vendor</label><select data-f="vendor">${vendorOpts}</select></div>
          <div class="filter-group"><label>Implementation status</label><select data-f="status">${statusOpts}</select></div>
          <div class="filter-group"><label>Min savings %: <b id="minPctLbl">${f.minSavingsPct}%</b></label>
            <input type="range" min="0" max="40" step="5" value="${f.minSavingsPct}" data-f="minSavingsPct" style="width:100%"></div>
          <label class="check"><input type="checkbox" data-f="preferred" ${f.preferred ? "checked" : ""}> Preferred items only</label>
          <label class="check"><input type="checkbox" data-f="contracted" ${f.contracted ? "checked" : ""}> Contracted items only</label>
        </aside>
        <div>
          <div class="toolbar">
            <div class="search"><span class="si">🔍</span><input type="text" id="catalogSearch" placeholder="Search SKU, product, vendor, category…" value="${esc(f.search)}"></div>
            <button class="btn btn-outline btn-sm" id="exportCsv">⬇ Export CSV</button>
          </div>
          <div class="table-wrap">
            <table class="data" style="min-width:1180px"><thead><tr>
              ${th("id", "SKU")}<th>Img</th>${th("productName", "Product")}<th>Category</th>${th("shopCode", "Shop")}<th>Vendor → Rec.</th>
              ${th("newUnitPrice", "Price / Each", "num")}<th class="num">UOM</th>${th("annualQuantity", "Annual Qty", "num")}
              ${th("currentAnnualSpend", "Annual Spend", "num")}${th("annualSavings", "Savings", "num")}${th("savingsPercentage", "%", "")}${th("implementationStatus", "Status")}
            </tr></thead><tbody>${body}</tbody></table>
          </div>
        </div>
      </div>`;
    },
    mount() {
      const f = State.catalog;
      const rerender = () => window.App.renderCurrent();
      const search = document.getElementById("catalogSearch");
      if (search) {
        search.addEventListener("input", (e) => { f.search = e.target.value; debounceRender(); });
        // keep focus/caret on rerender
        search.focus();
        const v = search.value; search.value = ""; search.value = v;
      }
      document.querySelectorAll("[data-f]").forEach((el) => {
        const key = el.getAttribute("data-f");
        const evt = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, (e) => {
          if (el.type === "checkbox") f[key] = e.target.checked;
          else if (key === "minSavingsPct") { f[key] = +e.target.value; }
          else f[key] = e.target.value;
          if (key === "category") f.subcategory = "";
          rerender();
        });
      });
      const clear = document.getElementById("clearFilters");
      if (clear) clear.addEventListener("click", () => {
        Object.assign(f, { search: "", category: "", subcategory: "", shop: "", vendor: "", status: "", minSavingsPct: 0, preferred: false, contracted: false });
        rerender();
      });
      document.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
        const col = th.getAttribute("data-sort");
        if (f.sort === col) f.dir = f.dir === "asc" ? "desc" : "asc";
        else { f.sort = col; f.dir = "desc"; }
        rerender();
      }));
      document.querySelectorAll("tr[data-sku]").forEach((tr) => tr.addEventListener("click", () => {
        const id = tr.getAttribute("data-sku");
        const idx = P.SKUS.findIndex((s) => s.id === id);
        State.comparePair = idx; location.hash = "#/comparison/" + id;
      }));
      const exp = document.getElementById("exportCsv");
      if (exp) exp.addEventListener("click", () => downloadCsv(P.skusToCsv(filteredSkus()), "sku-catalog.csv"));
    },
  };

  let _debounceTimer = null;
  function debounceRender() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => window.App.renderCurrent(), 180);
  }

  function downloadCsv(text, filename) {
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvEscape = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  // Savings report rolled up by broad category group → detailed category, with
  // a subtotal per group and a grand total.
  function categorySavingsReportCsv(skus) {
    const groups = {};
    skus.forEach((s) => {
      const g = s.categoryGroup || "Other", c = s.category || "Other";
      (groups[g] = groups[g] || {});
      (groups[g][c] = groups[g][c] || []).push(s);
    });
    const header = ["Category Group", "Category", "SKUs", "Current Annual Spend", "New Annual Spend", "Annual Savings", "Savings %"];
    const lines = [];
    Object.keys(groups).sort().forEach((grp) => {
      const cats = groups[grp];
      Object.keys(cats).sort().forEach((cat) => {
        const a = P.aggregate(cats[cat]);
        lines.push([grp, cat, cats[cat].length, P.round(a.baselineSpend), P.round(a.newSpend), P.round(a.savingsOpportunity), P.round(a.savingsPercentage, 1)]);
      });
      const all = Object.keys(cats).reduce((acc, k) => acc.concat(cats[k]), []);
      const a = P.aggregate(all);
      lines.push([grp, "— All " + grp, all.length, P.round(a.baselineSpend), P.round(a.newSpend), P.round(a.savingsOpportunity), P.round(a.savingsPercentage, 1)]);
    });
    const at = P.aggregate(skus);
    lines.push(["TOTAL", "", skus.length, P.round(at.baselineSpend), P.round(at.newSpend), P.round(at.savingsOpportunity), P.round(at.savingsPercentage, 1)]);
    return [header].concat(lines).map((r) => r.map(csvEscape).join(",")).join("\n");
  }
  // Per-SKU savings export (each row = one SKU, with price-per-each and savings).
  function skuSavingsCsv(skus) {
    const header = ["SKU", "Product", "Category", "Subcategory", "Shop", "Current Price/Each", "New Price/Each", "Annual Qty", "Current Annual Spend", "New Annual Spend", "Annual Savings", "Savings %"];
    const lines = skus.map((s) => [s.sku || s.id, s.productName, s.category, s.subcategory, s.shop, s.currentUnitPrice, s.newUnitPrice, s.annualQuantity, s.currentAnnualSpend, s.newAnnualSpend, s.annualSavings, s.savingsPercentage]);
    return [header].concat(lines).map((r) => r.map(csvEscape).join(",")).join("\n");
  }

  /* ============================== SAVINGS ============================== */
  PAGES.savings = {
    title: "Savings Opportunities",
    crumb: "Savings Opportunities",
    render() {
      const opps = P.opportunities();

      const views = ["Category", "Subcategory", "Shop", "Brand", "Vendor", "Region", "SKU"];
      const pills = views.map((v) => `<button class="pill ${State.savingsView === v ? "active" : ""}" data-view="${v}">${v}</button>`).join("");

      // Build grouped roll-up by the selected view
      const view = State.savingsView;
      const keyFn = {
        Category: (s) => s.category, Subcategory: (s) => s.category + " · " + s.subcategory,
        Shop: (s) => s.shopCode, Brand: (s) => s.shop, Vendor: (s) => s.recommendedVendor,
        Region: (s) => s.region, SKU: (s) => s.productName,
      }[view];
      const groups = {};
      P.scopedSkus().forEach((s) => { (groups[keyFn(s)] = groups[keyFn(s)] || []).push(s); });
      const grouped = Object.keys(groups).map((k) => ({ name: k, ...P.aggregate(groups[k]), rec: P.topVendor(groups[k]) }))
        .sort((a, b) => b.savingsOpportunity - a.savingsOpportunity);
      const maxG = mx(grouped.map((g) => g.savingsOpportunity));
      const groupRows = grouped.map((g) => `<tr>
        <td class="cell-strong">${esc(g.name)}</td>
        <td class="num">${fmt.money(g.baselineSpend)}</td>
        <td class="num">${fmt.money(g.newSpend)}</td>
        <td class="num text-green cell-strong">${fmt.money(g.savingsOpportunity)}</td>
        <td>${U.savingsBadge(g.savingsPercentage)}</td>
        <td style="min-width:160px"><div class="hbar" style="height:14px"><span style="width:${maxG ? (g.savingsOpportunity / maxG) * 100 : 0}%"></span></div></td>
      </tr>`).join("");

      const oppRows = opps.map((o) => `<tr>
        <td><span class="cell-strong">${esc(o.name)}</span><div class="cell-sub">${o.skuCount} SKU${o.skuCount !== 1 ? "s" : ""}</div></td>
        <td>${esc(o.category)}<div class="cell-sub">${esc(o.subcategory)}</div></td>
        <td>${esc(o.shopCode)}<div class="cell-sub">${esc(o.region)}</div></td>
        <td>${esc(o.currentSupplier)}<div class="cell-sub">→ ${esc(o.recommendedSupplier)}</div></td>
        <td class="num text-green cell-strong">${fmt.money(o.annualSavings)}</td>
        <td>${U.savingsBadge(o.savingsPercentage)}</td>
        <td>${U.easeBadge(o.ease)}</td>
        <td>${U.riskBadge(o.risk)}</td>
        <td><div class="tag-cats">${o.badges.map(U.oppBadge).join("")}</div></td>
        <td>${esc(o.owner)}</td>
        <td class="cell-sub">${esc(o.targetDate)}</td>
        <td>${U.statusBadge(o.status)}</td>
      </tr>`).join("");

      return `
      <div class="page-head"><h1>Savings Opportunities</h1><p>Prioritized savings across categories, shops, and vendors — segmented by ease, risk, and standardization potential.</p></div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="card-title">📐 Roll-up by view</h3>
        <div class="pillbar" id="savingsViews">${pills}</div>
        <div class="table-wrap" style="border:none">
          <table class="data" style="min-width:640px"><thead><tr>
            <th>${esc(view)}</th><th class="num">Baseline</th><th class="num">New</th><th class="num">Savings</th><th>%</th><th>Relative</th>
          </tr></thead><tbody>${groupRows}</tbody></table>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">🎯 Opportunity Register</h3>
        <div class="table-wrap" style="border:none">
          <table class="data" style="min-width:1180px"><thead><tr>
            <th>Opportunity</th><th>Category</th><th>Shop</th><th>Supplier → Rec.</th><th class="num">Savings</th><th>%</th><th>Ease</th><th>Risk</th><th>Badges</th><th>Owner</th><th>Target</th><th>Status</th>
          </tr></thead><tbody>${oppRows}</tbody></table>
        </div>
      </div>`;
    },
    mount() {
      document.querySelectorAll("#savingsViews [data-view]").forEach((b) => b.addEventListener("click", () => {
        State.savingsView = b.getAttribute("data-view");
        window.App.renderCurrent();
      }));
    },
  };

  /* ============================== SHOP VIEW ============================== */
  function shopBasisToggle(basis) {
    return `<div class="pillbar" style="margin-bottom:14px">
      <button class="pill ${basis === "plan" ? "active" : ""}" data-basis="plan">📐 Annual plan</button>
      <button class="pill ${basis === "actual" ? "active" : ""}" data-basis="actual">🧾 Actual volume (AP)</button>
    </div>`;
  }

  // Savings computed from actual invoiced AP volume × catalog savings rate.
  function actualVolumeView() {
    const ap = P.apSavingsAll();
    if (!ap.hasData) {
      return `<div class="notice" style="margin-bottom:16px">🧾 No AP spend uploaded yet. Add invoiced spend on the <a href="#/patterns">Buying Patterns</a> tab to see savings based on what each shop <b>actually bought</b>.</div>`;
    }
    const t = ap.totals;
    const period = ap.minDate && ap.maxDate ? `${ap.minDate} → ${ap.maxDate}` : "—";
    const rows = ap.shops.map((s) => `<tr>
        <td class="cell-strong">${esc(s.shop)}</td>
        <td class="cell-sub">${esc(s.minDate || "—")} → ${esc(s.maxDate || "—")}<div class="cell-sub">${s.months} mo · ${fmt.num(s.lines)} lines</div></td>
        <td class="num">${fmt.money(s.actualSpend)}</td>
        <td class="num cell-strong text-green">${fmt.money(s.savings)}</td>
        <td>${U.savingsBadge(s.savingsPct)}</td>
        <td class="num">${fmt.money(s.annualizedSavings)}</td>
      </tr>`).join("");
    return `
      <div class="grid cols-4" style="margin-bottom:16px">
        ${U.statCard({ label: "Savings on Actual Volume", value: fmt.money(t.savings), delta: "▼ " + fmt.pct(t.savingsPct) + " of invoiced", accent: "green", icon: "🧾", iconBg: "var(--green-bg)" })}
        ${U.statCard({ label: "Invoiced Spend (AP)", value: fmt.money(t.actualSpend), delta: esc(period), deltaClass: "text-muted", accent: "navy", icon: "💵", iconBg: "var(--navy-50)" })}
        ${U.statCard({ label: "Annualized Savings", value: fmt.money(t.annualizedSavings), delta: "projected 12-mo", deltaClass: "text-muted", accent: "blue", icon: "📈", iconBg: "var(--blue-bg)" })}
        ${U.statCard({ label: "Shops with Invoices", value: ap.shops.length, accent: "navy", icon: "🏬", iconBg: "var(--navy-50)" })}
      </div>
      <div class="card" style="margin-bottom:18px">
        <h3 class="card-title">🧾 Savings on actual invoiced volume by shop</h3>
        <p class="cell-sub" style="margin-top:-4px">Each shop's invoiced AP spend per category × the negotiated savings rate from the catalog. Annualized to a full year based on the period covered.</p>
        <div class="table-wrap" style="border:none"><table class="data" style="min-width:720px"><thead><tr>
          <th>Shop</th><th>Period</th><th class="num">Invoiced spend</th><th class="num">Est. savings</th><th>Rate</th><th class="num">Annualized</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
  }

  PAGES.shops = {
    title: "Shop View",
    crumb: "Shop View",
    render(params) {
      const shops = P.shops();
      const code = params[0] ? decodeURIComponent(params[0]) : null;
      if (!code) {
        const basis = State.shopBasis === "actual" ? "actual" : "plan";
        const cards = shops.map((s) => `<div class="cat-tile-wrap" style="position:relative">
          <a class="cat-tile" href="#/shops/${encodeURIComponent(s.code)}">
          <div class="tile-head" style="background:var(--navy)"><span class="ic">🏬</span><span class="nm">${esc(s.shopName)}</span></div>
          <div class="tile-body">
            <div class="tile-metric"><span class="k">Region</span><span class="v">${esc(s.region)}</span></div>
            <div class="tile-metric"><span class="k">Current spend</span><span class="v">${fmt.money(s.baselineSpend)}</span></div>
            <div class="tile-metric"><span class="k">New spend</span><span class="v">${fmt.money(s.newSpend)}</span></div>
            <div class="tile-metric"><span class="k">Savings</span><span class="v text-green">${fmt.money(s.savingsOpportunity)}</span></div>
            <div class="tile-foot">${U.savingsBadge(s.savingsPercentage)}${U.statusBadge(s.implementationStatus)}</div>
          </div></a>
          <button class="btn btn-outline btn-sm" data-shop-dl="${esc(s.code)}" style="position:absolute;top:10px;right:10px">⬇ CSV</button>
        </div>`).join("");
        return `<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div><h1>Shop View</h1><p>Decentralized shop dashboards. Each shop sees only its own relevant savings opportunities and action items.</p></div>
            <button class="btn btn-green btn-sm" id="dlAllShops">⬇ All shops — savings (CSV)</button>
          </div>
          ${shopBasisToggle(basis)}
          ${basis === "actual" ? actualVolumeView() : `
            <div class="cell-sub" style="margin:0 0 14px">Savings opportunity is projected on each shop's annual purchase volume (quantity × negotiated price delta).</div>`}
          <div class="grid cols-3">${cards}</div>`;
      }
      const shop = shops.find((s) => s.code === code);
      if (!shop) return `<div class="empty">Shop not found.</div>`;
      // Tabs are driven by the shop's ACTUAL categories, plus an All SKUs tab so
      // every SKU for the shop is always visible with its savings.
      const shopCats = Array.from(new Set(shop.rows.map((r) => r.categoryGroup))).filter(Boolean).sort();
      const tabs = ["Overview", "All SKUs"].concat(shopCats).concat(["Action Items"]);
      const tab = State.shopTab && tabs.includes(State.shopTab) ? State.shopTab : "Overview";
      const tabBtns = tabs.map((t) => `<button class="${t === tab ? "active" : ""}" data-tab="${t}">${t}${t === "All SKUs" ? ` (${shop.rows.length})` : ""}</button>`).join("");

      let tabContent = "";
      if (tab === "Overview") {
        const switchItems = shop.rows.filter((r) => r.currentVendor !== r.recommendedVendor && r.savingsPercentage >= 15);
        const keepItems = shop.rows.filter((r) => r.implementationStatus === "Implemented" || (r.preferredItem && r.currentVendor === r.recommendedVendor));
        const reviewItems = shop.rows.filter((r) => r.implementationStatus === "In Review" || r.qualityTier === "Luxury");
        const li = (r) => `<li><span class="check-ico">●</span><div><span class="cell-strong">${esc(r.productName)}</span> <span class="cell-sub">— ${esc(r.subcategory)} · save ${fmt.pct(r.savingsPercentage)}</span></div></li>`;
        tabContent = `
          <div class="grid cols-4" style="margin-bottom:18px">
            ${U.statCard({ label: "Current Annual Spend", value: fmt.money(shop.baselineSpend), accent: "navy" })}
            ${U.statCard({ label: "New Annual Spend", value: fmt.money(shop.newSpend), accent: "blue" })}
            ${U.statCard({ label: "Savings Opportunity", value: fmt.money(shop.savingsOpportunity), delta: "▼ " + fmt.pct(shop.savingsPercentage), accent: "green" })}
            ${U.statCard({ label: "SKUs", value: shop.skuCount, accent: "navy" })}
          </div>
          <div class="grid cols-2">
            <div class="card"><h3 class="card-title">📂 Categories Impacted</h3><div class="tag-cats">${shop.categoriesImpacted.map((c) => `<span class="badge navy">${esc(c)}</span>`).join("")}</div>
              <h3 class="card-title" style="margin-top:18px">🏷️ Recommended Vendors</h3><div class="tag-cats">${shop.recommendedVendors.map((v) => `<span class="badge blue">${esc(v)}</span>`).join("")}</div></div>
            <div class="card"><h3 class="card-title">🔁 Products to Switch (${switchItems.length})</h3><ul class="list-clean">${switchItems.slice(0, 6).map(li).join("") || "<li class='text-muted'>None</li>"}</ul></div>
          </div>
          <div class="grid cols-2" style="margin-top:16px">
            <div class="card"><h3 class="card-title">✅ Products to Keep (${keepItems.length})</h3><ul class="list-clean">${keepItems.slice(0, 6).map(li).join("") || "<li class='text-muted'>None</li>"}</ul></div>
            <div class="card"><h3 class="card-title">👀 Products Requiring Review (${reviewItems.length})</h3><ul class="list-clean">${reviewItems.slice(0, 6).map(li).join("") || "<li class='text-muted'>None</li>"}</ul></div>
          </div>`;
      } else if (tab === "Action Items") {
        const actions = [
          { t: "Review recommended SKUs", d: shop.skuCount + " SKUs flagged for this shop", done: shop.rows.some((r) => r.implementationStatus !== "Not Reviewed") },
          { t: "Approve replacement items", d: shop.rows.filter((r) => r.implementationStatus === "In Review").length + " items in review", done: shop.rows.some((r) => r.implementationStatus === "Approved" || r.implementationStatus === "Implemented") },
          { t: "Confirm local vendor constraints", d: "Validate any local-only vendor requirements", done: false },
          { t: "Confirm product quality concerns", d: shop.rows.filter((r) => r.qualityTier === "Luxury").length + " luxury-tier items to validate", done: false },
          { t: "Confirm implementation date", d: "Lock target go-live with procurement", done: shop.rows.some((r) => r.implementationStatus === "Implemented") },
        ];
        tabContent = `<div class="card"><h3 class="card-title">📋 Action List</h3><ul class="list-clean">${actions.map((a) => `<li>
            <span class="${a.done ? "check-ico" : "dot-ico"}">${a.done ? "✔" : "○"}</span>
            <div><span class="cell-strong">${esc(a.t)}</span><div class="cell-sub">${esc(a.d)}</div></div>
            <span style="margin-left:auto">${a.done ? U.statusBadge("Approved") : U.statusBadge("In Review")}</span>
          </li>`).join("")}</ul></div>`;
      } else {
        const allTab = tab === "All SKUs";
        const rows = allTab ? shop.rows : shop.rows.filter((r) => r.categoryGroup === tab);
        const toolbar = allTab ? `<div class="toolbar" style="justify-content:space-between">
            <div class="cell-sub">All ${rows.length} SKU(s) for ${esc(shop.shopName)} · total savings <b class="text-green">${fmt.money(shop.savingsOpportunity)}</b> (${fmt.pct(shop.savingsPercentage)})</div>
            <button class="btn btn-green btn-sm" id="dlShopSkus">⬇ Download all SKUs (CSV)</button>
          </div>` : "";
        const statusSelect = (r) => `<select class="approve-select" data-approve="${esc(r.id)}" onclick="event.stopPropagation()" title="Set approval status">${P.STATUSES.map((st) => `<option ${st === r.implementationStatus ? "selected" : ""}>${esc(st)}</option>`).join("")}</select>`;
        const table = rows.length ? `<div class="table-wrap"><table class="data" style="min-width:920px"><thead><tr>
            <th>SKU</th>${allTab ? "<th>Category</th>" : ""}<th>Product</th><th>Subcategory</th><th>Vendor → Rec.</th><th class="num">Price/Each</th><th class="num">Current</th><th class="num">New</th><th class="num">Savings</th><th>%</th><th>Approval</th>
          </tr></thead><tbody>${rows.map((r) => `<tr class="row-link" onclick="location.hash='#/comparison/${r.id}'">
            <td class="mono">${esc(r.sku || r.id)}</td>${allTab ? `<td>${esc(r.category)}</td>` : ""}<td class="cell-strong">${esc(r.productName)}</td><td>${esc(r.subcategory)}</td>
            <td>${esc(r.currentVendor)}<div class="cell-sub">→ ${esc(r.recommendedVendor)}</div></td>
            <td class="num"><span class="price-old">${fmt.money(r.currentUnitPrice, 2)}</span><div class="text-green cell-strong">${fmt.money(r.newUnitPrice, 2)}</div></td>
            <td class="num">${fmt.money(r.currentAnnualSpend)}</td><td class="num text-green">${fmt.money(r.newAnnualSpend)}</td>
            <td class="num cell-strong text-green">${fmt.money(r.annualSavings)}</td><td>${U.savingsBadge(r.savingsPercentage)}</td><td>${statusSelect(r)}</td>
          </tr>`).join("")}</tbody></table></div>` : `<div class="empty">No ${esc(tab)} SKUs assigned to ${esc(shop.shopName)}.</div>`;
        tabContent = toolbar + table;
      }

      return `
        <div class="page-head"><h1>🏬 ${esc(shop.shopName)}</h1><p>${esc(shop.region)} region · ${esc(shop.code)} · <a href="#/shops">← all shops</a></p></div>
        <div class="tabs" id="shopTabs">${tabBtns}</div>
        ${tabContent}`;
    },
    mount() {
      document.querySelectorAll("[data-basis]").forEach((b) => b.addEventListener("click", () => {
        State.shopBasis = b.getAttribute("data-basis");
        window.App.renderCurrent();
      }));
      document.querySelectorAll("#shopTabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
        State.shopTab = b.getAttribute("data-tab");
        window.App.renderCurrent();
      }));
      const dl = document.getElementById("dlShopSkus");
      if (dl) dl.addEventListener("click", () => {
        const m = location.hash.match(/#\/shops\/([^/?]+)/);
        if (!m) return;
        const shop = P.shops().find((s) => s.code === decodeURIComponent(m[1]));
        if (!shop || !shop.rows.length) { alert("No SKUs for this shop yet."); return; }
        downloadCsv(skuSavingsCsv(shop.rows), "shop-" + shop.code.replace(/\s+/g, "-").toLowerCase() + "-skus.csv");
      });
      // Shop grid: combined export + per-shop export.
      const dlAll = document.getElementById("dlAllShops");
      if (dlAll) dlAll.addEventListener("click", () => {
        if (!P.SKUS.length) { alert("No SKUs loaded yet."); return; }
        downloadCsv(skuSavingsCsv(P.SKUS), "all-shops-savings.csv");
      });
      document.querySelectorAll("[data-shop-dl]").forEach((b) => b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const shop = P.shops().find((s) => s.code === b.getAttribute("data-shop-dl"));
        if (!shop || !shop.rows.length) { alert("No SKUs for this shop yet."); return; }
        downloadCsv(skuSavingsCsv(shop.rows), "shop-" + shop.code.replace(/\s+/g, "-").toLowerCase() + "-skus.csv");
      }));
      // Shop-facing approval write-back: change a SKU's status and persist.
      document.querySelectorAll("[data-approve]").forEach((sel) => sel.addEventListener("change", async (e) => {
        e.stopPropagation();
        const id = sel.getAttribute("data-approve");
        P.updateSku(id, { implementationStatus: sel.value });
        sel.style.outline = "2px solid var(--green, #16a34a)";
        if (window.Store && window.Store.available()) {
          const s = P.SKUS.find((x) => x.id === id);
          try { await window.Store.upsertSku(s); setTimeout(() => { sel.style.outline = ""; }, 800); }
          catch (err) { sel.style.outline = "2px solid var(--red, #dc2626)"; alert("Could not save approval: " + err.message); }
        } else { setTimeout(() => { sel.style.outline = ""; }, 800); }
      }));
    },
  };

  /* ============================== VENDORS ============================== */
  PAGES.vendors = {
    title: "Vendors",
    crumb: "Vendors",
    render() {
      const canEdit = State.role === "Procurement Admin";
      const master = P.vendorMaster();
      const cats = P.VENDOR_CATEGORIES;
      // Spend per vendor from AP, consolidated onto canonical vendor names.
      const spendBy = {};
      (P.apVendorSummary ? P.apVendorSummary("All").byVendor : []).forEach((v) => {
        const k = P.canonicalVendor(v.vendor) || v.vendor;
        spendBy[k] = (spendBy[k] || 0) + v.spend;
      });
      const contractsCount = (n) => (P.contractsByVendor ? P.contractsByVendor(n).length : 0);
      const withSpend = master.filter((v) => spendBy[v.name] > 0).length;
      const withContracts = master.filter((v) => contractsCount(v.name)).length;
      const byCat = P.vendorsByCategory();

      const createForm = (canEdit && State.vendorCreate) ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--teal)">
          <h3 class="card-title">➕ Add a vendor</h3>
          <div class="grid cols-4" style="gap:10px;align-items:end">
            <div class="field" style="margin:0"><label>Vendor name</label><input type="text" id="nvName" placeholder="Acme Supply Co."></div>
            <div class="field" style="margin:0"><label>Category</label><select id="nvCat" class="approve-select" style="max-width:none;width:100%">${cats.map((c) => `<option ${c === "Other" ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
            <div class="field" style="margin:0"><label>Notes</label><input type="text" id="nvNotes" placeholder="optional"></div>
            <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" id="nvSave">Save</button><button class="btn btn-outline btn-sm" id="nvCancel">Cancel</button></div>
          </div>
          <span class="cell-sub" id="nvMsg"></span>
        </div>` : "";

      const controls = `<div class="toolbar" style="margin-bottom:14px">
          <div class="search"><span class="si">🔍</span><input type="text" id="vSearch" placeholder="Search vendors…"></div>
          <select id="vCatFilter" class="approve-select" style="max-width:none">${["All"].concat(cats).map((c) => `<option>${esc(c)}</option>`).join("")}</select>
          ${canEdit ? `<button class="btn btn-primary btn-sm" id="vCreate">➕ New vendor</button>
            <input type="file" id="vFile" accept=".csv,.xlsx,.xls" style="display:none">
            <button class="btn btn-outline btn-sm" id="vUpload">⬆ Upload list</button>
            <button class="btn btn-outline btn-sm" id="vTpl">⬇ Template</button>
            <span class="cell-sub" id="vMsg"></span>` : ""}
        </div>`;

      const rows = master.map((v) => `<tr data-vname="${esc((v.name + " " + (v.aliases || []).join(" ")).toLowerCase())}" data-vcat="${esc(v.category)}">
          <td class="cell-strong">${esc(v.name)}${(v.aliases || []).length ? `<div class="cell-sub">incl. ${(v.aliases || []).map(esc).join(", ")}</div>` : ""}</td>
          <td>${canEdit ? `<select class="approve-select" data-vcatsel="${esc(v.id)}" style="max-width:none">${cats.map((c) => `<option ${c === v.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : `<span class="badge navy">${esc(v.category)}</span>`}</td>
          <td class="num">${spendBy[v.name] ? fmt.money(spendBy[v.name]) : "<span class='cell-sub'>—</span>"}</td>
          <td>${contractsCount(v.name) ? `<span class="badge purple">${contractsCount(v.name)} contract</span>` : "<span class='cell-sub'>—</span>"}</td>
          <td class="cell-sub">${esc(v.notes || "")}</td>
          ${canEdit ? `<td><button class="btn btn-outline btn-sm" data-vdel="${esc(v.id)}" title="Remove">✕</button></td>` : ""}
        </tr>`).join("");

      const masterTable = `
        <div class="page-head"><h1>🏷️ Vendors</h1><p>Consolidated, categorized vendor master — ${fmt.num(master.length)} vendors across ${fmt.num(Object.keys(byCat).length)} categories. Add or upload vendors and keep duplicate names merged.</p></div>
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Vendors", value: fmt.num(master.length), accent: "navy", icon: "🏷️", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Categories", value: fmt.num(Object.keys(byCat).length), accent: "blue", icon: "🗂️", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "With Spend (AP)", value: fmt.num(withSpend), accent: "green", icon: "💵", iconBg: "var(--green-bg)" })}
          ${U.statCard({ label: "With Contracts", value: fmt.num(withContracts), accent: "navy", icon: "📑", iconBg: "var(--navy-50)" })}
        </div>
        ${controls}${createForm}
        <div class="table-wrap"><table class="data" style="min-width:760px"><thead><tr>
          <th>Vendor</th><th>Category</th><th class="num">Spend (AP)</th><th>Contracts</th><th>Notes</th>${canEdit ? "<th></th>" : ""}
        </tr></thead><tbody>${rows}</tbody></table></div>`;

      // Build the contract price book block for a vendor, grouped by category.
      const priceBook = (vendorName) => {
        const books = (P.contractsByVendor ? P.contractsByVendor(vendorName) : []);
        if (!books.length) return "";
        const blocks = books.map((c) => {
          const byCat = {};
          c.items.forEach((it) => { (byCat[it.category] = byCat[it.category] || []).push(it); });
          const cats = Object.keys(byCat).sort().map((cat) => `
            <div style="margin-top:6px"><div class="cell-strong" style="font-size:12px">${esc(cat)}</div>
            ${byCat[cat].map((it) => `<div class="cell-sub" style="display:flex;justify-content:space-between;gap:10px">
              <span>${esc(it.name)}${it.uom && it.uom !== "Each" ? ` <span class="badge navy" style="font-size:9px">${esc(it.uom)}</span>` : ""}</span>
              <span class="mono">${fmt.money(it.unitPrice, 2)}</span></div>`).join("")}</div>`).join("");
          const term = c.effectiveDate ? ` · ${esc(c.effectiveDate)}${c.expirationDate ? "–" + esc(c.expirationDate) : ""}` : "";
          // Match this contract's rates against shop SKUs → switch savings.
          const match = P.matchContractToSkus(c);
          const positive = match.matches.filter((m) => m.annualSavings > 0);
          const matchBlock = positive.length ? `<details style="margin-top:4px"><summary class="cell-strong text-green" style="cursor:pointer">🔗 Match to shop SKUs · ${positive.length} match(es), save ${fmt.money(match.totalSavings)}/yr</summary>
            <div class="table-wrap" style="border:none;margin-top:4px"><table class="data" style="min-width:520px"><thead><tr><th>Shop</th><th>Current SKU</th><th class="num">Now/ea</th><th class="num">Contract/ea</th><th class="num">Savings/yr</th></tr></thead><tbody>${positive.slice(0, 12).map((m) => `<tr><td>${esc(m.sku.shop || "—")}</td><td class="cell-sub">${esc(m.sku.productName)}</td><td class="num">${fmt.money(m.currentEach, 2)}</td><td class="num text-green">${fmt.money(m.contractEach, 2)}</td><td class="num cell-strong text-green">${fmt.money(m.annualSavings)}</td></tr>`).join("")}</tbody></table></div></details>` : "";
          return `<details style="margin-top:6px"><summary class="cell-strong" style="cursor:pointer">📑 ${esc(c.title)} <span class="cell-sub">(${c.items.length} item(s)${term})</span></summary>${cats}${matchBlock}</details>`;
        }).join("");
        return `<div style="margin-top:12px;border-top:1px solid var(--gray-100);padding-top:10px"><div class="cell-strong" style="font-size:12px;margin-bottom:2px">📒 Contract price book</div>${blocks}</div>`;
      };
      const bookVendors = master.filter((v) => contractsCount(v.name));
      const shopOpts = ["(Unassigned)"].concat((P.SHOPS || []).map((s) => s.shopName));
      const pubControl = (vname) => canEdit ? `<div style="margin-top:10px;border-top:1px solid var(--gray-100);padding-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select class="approve-select" data-pubshop="${esc(vname)}">${shopOpts.map((o) => `<option>${esc(o)}</option>`).join("")}</select>
          <button class="btn btn-primary btn-sm" data-pubvendor="${esc(vname)}">📤 Publish price book → catalog</button>
          <span class="cell-sub" data-pubmsg="${esc(vname)}"></span>
        </div>` : "";
      const books = bookVendors.length ? `<div class="section-title" style="margin-top:24px">📒 Vendor price books</div>
        <div class="grid cols-2">${bookVendors.map((v) => `<div class="card"><h3 class="card-title">🏷️ ${esc(v.name)} <span class="badge navy">${esc(v.category)}</span></h3>${priceBook(v.name)}${pubControl(v.name)}</div>`).join("")}</div>` : "";

      return masterTable + books;
    },
    mount() {
      const rerender = () => window.App.renderCurrent();
      // Publish a vendor's price book into the catalog as SKUs.
      document.querySelectorAll("[data-pubvendor]").forEach((b) => b.addEventListener("click", async () => {
        const vname = b.getAttribute("data-pubvendor");
        const escAttr = (window.CSS && CSS.escape) ? CSS.escape(vname) : vname;
        const sel = document.querySelector(`[data-pubshop="${escAttr}"]`);
        const shop = sel && sel.value && sel.value !== "(Unassigned)" ? sel.value : "";
        const msg = document.querySelector(`[data-pubmsg="${escAttr}"]`);
        b.disabled = true; if (msg) msg.textContent = "Publishing…";
        let added = 0;
        (P.contractsByVendor ? P.contractsByVendor(vname) : []).forEach((c) => { added += (P.publishContractToCatalog(c.id, shop).added || 0); });
        try { if (window.Store && window.Store.available()) await window.Store.pushAll(); } catch (e) { if (msg) msg.textContent = "⚠️ " + (e.message || e); b.disabled = false; return; }
        if (msg) msg.innerHTML = `<span class="text-green">✅ Published ${added} item(s) to the catalog${shop ? " under " + esc(shop) : ""} — now on Dashboard, Catalog, Shop View &amp; Savings.</span>`;
      }));
      const search = document.getElementById("vSearch");
      const catFilter = document.getElementById("vCatFilter");
      const rows = Array.from(document.querySelectorAll("tr[data-vname]"));
      const applyFilter = () => {
        const q = ((search && search.value) || "").toLowerCase().trim();
        const cat = catFilter ? catFilter.value : "All";
        rows.forEach((r) => {
          const okq = !q || r.getAttribute("data-vname").includes(q);
          const okc = cat === "All" || r.getAttribute("data-vcat") === cat;
          r.style.display = (okq && okc) ? "" : "none";
        });
      };
      if (search) search.addEventListener("input", applyFilter);
      if (catFilter) catFilter.addEventListener("change", applyFilter);

      const create = document.getElementById("vCreate");
      if (create) create.addEventListener("click", () => { State.vendorCreate = !State.vendorCreate; rerender(); });
      const nvCancel = document.getElementById("nvCancel");
      if (nvCancel) nvCancel.addEventListener("click", () => { State.vendorCreate = false; rerender(); });
      const nvSave = document.getElementById("nvSave");
      if (nvSave) nvSave.addEventListener("click", async () => {
        const name = (document.getElementById("nvName").value || "").trim();
        const msg = document.getElementById("nvMsg");
        if (!name) { msg.textContent = "Enter a vendor name."; return; }
        const rec = P.addVendorRecord({ name, category: document.getElementById("nvCat").value, notes: (document.getElementById("nvNotes").value || "").trim() });
        try { if (window.Store && window.Store.available()) await window.Store.saveVendor(rec); } catch (e) { msg.textContent = "⚠️ " + (e.message || e); return; }
        State.vendorCreate = false; rerender();
      });

      document.querySelectorAll("[data-vcatsel]").forEach((sel) => sel.addEventListener("change", async () => {
        const rec = (P.VENDORS_DB || []).find((v) => v.id === sel.getAttribute("data-vcatsel"));
        if (!rec) return;
        rec.category = sel.value;
        const tr = sel.closest("tr"); if (tr) tr.setAttribute("data-vcat", rec.category);
        try { if (window.Store && window.Store.available()) await window.Store.saveVendor(rec); } catch (_) { /* ignore */ }
      }));

      document.querySelectorAll("[data-vdel]").forEach((b) => b.addEventListener("click", async () => {
        const rec = (P.VENDORS_DB || []).find((v) => v.id === b.getAttribute("data-vdel"));
        if (!rec || !confirm("Remove vendor “" + rec.name + "”?")) return;
        P.removeVendorRecord(rec.id);
        try { if (window.Store && window.Store.available()) await window.Store.deleteVendor(rec.id); } catch (_) { /* ignore */ }
        rerender();
      }));

      const tpl = document.getElementById("vTpl");
      if (tpl) tpl.addEventListener("click", () => {
        const blob = new Blob(["Vendor,Category,Notes\nAcme Supply Co.,Supplies & Equipment,Primary janitorial\n"], { type: "text/csv" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "vendors_template.csv"; a.click();
      });

      const up = document.getElementById("vUpload");
      const file = document.getElementById("vFile");
      const msg = document.getElementById("vMsg");
      async function readMatrix(f) {
        const name = f.name.toLowerCase();
        if (name.endsWith(".csv") || f.type === "text/csv") return P.parseCsv(await f.text());
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      }
      if (up && file) {
        up.addEventListener("click", () => file.click());
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0]; if (!f) return;
          msg.textContent = "Reading " + f.name + "…";
          try {
            const { added } = P.ingestVendorRows(await readMatrix(f));
            if (!added) { msg.textContent = "⚠️ No vendor names found."; return; }
            msg.textContent = `Saving ${added}…`;
            if (window.Store && window.Store.available()) await window.Store.saveVendors(P.vendorMaster());
            rerender();
          } catch (e) { msg.textContent = "⚠️ " + (e.message || e); }
          finally { file.value = ""; }
        });
      }
    },
  };

  /* ============================== COMPARISON ============================== */
  PAGES.comparison = {
    title: "Product Comparison",
    crumb: "Product Comparison",
    render(params) {
      if (!P.SKUS.length) {
        return `<div class="page-head"><h1>Product Comparison</h1><p>Side-by-side comparison of recommended replacements.</p></div>${emptyState("Add products in the Admin tab to compare items side by side.")}`;
      }
      let sku;
      if (params[0]) sku = P.SKUS.find((s) => s.id === decodeURIComponent(params[0]));
      if (!sku) sku = P.SKUS[State.comparePair] || P.SKUS[0];
      const selector = P.SKUS.map((s) => `<option value="${s.id}" ${s.id === sku.id ? "selected" : ""}>${esc(s.id)} — ${esc(s.productName)}</option>`).join("");

      const col = (title, cls, data) => `<div class="compare-col ${cls}">
        <h4>${title}</h4>
        <div class="prod-img" style="margin:8px 0 14px">${data.img}</div>
        <div style="font-weight:700;font-size:15px;color:var(--navy-900);margin-bottom:8px">${esc(data.product)}</div>
        <div class="compare-row"><span class="k">Vendor</span><span class="v">${esc(data.vendor)}</span></div>
        <div class="compare-row"><span class="k">Unit price</span><span class="v ${data.priceClass}">${data.price}</span></div>
        <div class="compare-row"><span class="k">Unit of measure</span><span class="v">${esc(sku.unitOfMeasure)}</span></div>
        <div class="compare-row"><span class="k">Pack size</span><span class="v">${esc(sku.packSize)}</span></div>
        <div class="compare-row"><span class="k">Quality tier</span><span class="v">${esc(sku.qualityTier)}</span></div>
        <div class="compare-row"><span class="k">Annual spend</span><span class="v ${data.spendClass}">${data.spend}</span></div>
        <div class="compare-row"><span class="k">Approval status</span><span class="v">${U.statusBadge(sku.implementationStatus)}</span></div>
      </div>`;

      return `
        <div class="page-head"><h1>Product Comparison</h1><p>Side-by-side comparison to help shop operators understand why procurement recommends a replacement or standardized item.</p></div>
        <div class="toolbar"><div class="field" style="margin:0;min-width:340px"><label>Select SKU to compare</label><select id="compareSelect">${selector}</select></div></div>
        <div class="rec-callout">
          <span class="big">💡</span>
          <div><b>Recommended savings opportunity:</b> switch to ${esc(sku.recommendedVendor)} to save
          <b>${fmt.pct(sku.savingsPercentage)}</b> on ${esc(sku.productName)}.</div>
        </div>
        ${(() => {
          const opts = P.vendorOptionsForSub ? P.vendorOptionsForSub(sku.subcategory) : [];
          if (!opts.length) return "";
          return `<div class="card" style="margin-bottom:18px"><h3 class="card-title">🏷️ Vendor options for ${esc(sku.subcategory)} <span class="cell-sub">— a menu, not forced</span></h3>
            <div class="tag-cats">${opts.map((o) => `<span class="badge ${o === sku.recommendedVendor ? "green" : "navy"}">${esc(o)}${o === sku.recommendedVendor ? " ★" : ""}</span>`).join("")}</div>
            <div class="cell-sub" style="margin-top:8px">Recommended vendors seen for this sub-category across shops — pick whichever fits; nothing is forced.</div></div>`;
        })()}
        <div class="compare-grid">
          ${col("Current Product", "current", {
            img: "📦", product: sku.productName, vendor: sku.currentVendor,
            price: fmt.money(sku.currentUnitPrice, 2), priceClass: "", spend: fmt.money(sku.currentAnnualSpend), spendClass: "",
          })}
          <div class="compare-arrow">➜</div>
          ${col("Recommended Replacement", "recommended", {
            img: "🏆", product: sku.productName + " (Standardized)", vendor: sku.recommendedVendor,
            price: fmt.money(sku.newUnitPrice, 2), priceClass: "text-green", spend: fmt.money(sku.newAnnualSpend), spendClass: "text-green",
          })}
        </div>
        <div class="grid cols-3" style="margin-top:18px">
          ${U.statCard({ label: "Old Price", value: fmt.money(sku.currentUnitPrice, 2), accent: "navy" })}
          ${U.statCard({ label: "New Price", value: fmt.money(sku.newUnitPrice, 2), accent: "blue" })}
          ${U.statCard({ label: "Price Difference", value: "▼ " + fmt.pct(sku.savingsPercentage), accent: "green" })}
        </div>
        <div class="card" style="margin-top:18px"><h3 class="card-title">📝 Product Notes</h3><p class="text-muted">${esc(sku.notes)}</p>
          <div class="tag-cats" style="margin-top:8px">${sku.preferredItem ? '<span class="badge blue">★ Preferred</span>' : ""}${sku.contractedItem ? '<span class="badge purple">Contracted</span>' : ""}<span class="badge navy">${esc(sku.category)} · ${esc(sku.subcategory)}</span></div>
        </div>`;
    },
    mount() {
      const sel = document.getElementById("compareSelect");
      if (sel) sel.addEventListener("change", (e) => { location.hash = "#/comparison/" + e.target.value; });
    },
  };

  /* ============================== TRACKER ============================== */
  PAGES.tracker = {
    title: "Implementation Tracker",
    crumb: "Implementation Tracker",
    render() {
      const rows = P.trackerRows();
      const statuses = ["Not started", "In review", "Approved", "Vendor transition started", "Implemented", "Deferred", "Rejected"];
      const counts = {};
      statuses.forEach((s) => counts[s] = rows.filter((r) => r.status === s).length);
      const totalSav = rows.reduce((a, r) => a + r.annualSavings, 0);
      const implementedSav = rows.filter((r) => r.status === "Implemented").reduce((a, r) => a + r.annualSavings, 0);
      const adoption = totalSav ? (implementedSav / totalSav) * 100 : 0;

      const statCards = statuses.filter((s) => counts[s]).map((s) => `<div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">${U.statusBadge(s)}<span class="value" style="font-size:20px;font-weight:700">${counts[s]}</span></div></div>`).join("");

      const body = rows.map((r) => `<tr>
        <td><span class="cell-strong">${esc(r.shop)}</span><div class="cell-sub">${esc(r.region)}</div></td>
        <td>${esc(r.category)}<div class="cell-sub">${esc(r.subcategory)}</div></td>
        <td>${esc(r.recommendedVendor)}</td>
        <td class="num">${r.skuCount}</td>
        <td class="num text-green cell-strong">${fmt.money(r.annualSavings)}</td>
        <td>${U.statusBadge(r.status)}</td>
        <td>${esc(r.localOwner)}<div class="cell-sub">Proc: ${esc(r.procurementOwner)}</div></td>
        <td class="cell-sub">${esc(r.targetDate)}</td>
        <td class="cell-sub">${esc(r.completionDate || "—")}</td>
        <td>${r.blocker ? `<span class="badge amber">${esc(r.blocker)}</span>` : '<span class="text-muted">—</span>'}</td>
      </tr>`).join("");

      return `
        <div class="page-head"><h1>Implementation Tracker</h1><p>Adoption tracking across decentralized shops — from review to vendor transition to implementation.</p></div>
        <div class="grid cols-3" style="margin-bottom:16px">
          ${U.statCard({ label: "Tracked Initiatives", value: rows.length, accent: "navy", icon: "📋", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Savings In Flight", value: fmt.money(totalSav), accent: "blue", icon: "💵", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "Adoption (by $ implemented)", value: fmt.pct(adoption), accent: "green", icon: "✅", iconBg: "var(--green-bg)" })}
        </div>
        <div class="card" style="margin-bottom:16px"><h3 class="card-title">Overall adoption</h3>${U.progress(adoption)}<div class="cell-sub" style="margin-top:6px">${fmt.money(implementedSav)} implemented of ${fmt.money(totalSav)} total opportunity</div></div>
        <div class="grid cols-5" style="margin-bottom:18px">${statCards}</div>
        <div class="table-wrap"><table class="data" style="min-width:1100px"><thead><tr>
          <th>Shop</th><th>Category</th><th>Recommended Vendor</th><th class="num">SKUs</th><th class="num">Savings</th><th>Status</th><th>Owner</th><th>Target</th><th>Completed</th><th>Risk / Blocker</th>
        </tr></thead><tbody>${body}</tbody></table></div>`;
    },
  };

  /* ============================== ADMIN ============================== */

  // Render the editable SKU table used in the Admin console.
  function skuEditorTable(skus) {
    if (!skus.length) {
      return `<div class="empty" style="padding:26px;text-align:center">No SKUs to show. Upload a file above or load sample data.</div>`;
    }
    // Group by shop so an upload is easy to review brand-by-brand.
    const sorted = skus.slice().sort((a, b) =>
      (a.shop || "~").localeCompare(b.shop || "~") ||
      (a.category || "").localeCompare(b.category || "") ||
      (a.subcategory || "").localeCompare(b.subcategory || "") ||
      (a.productName || "").localeCompare(b.productName || ""));
    const rows = sorted.map((s) => `<tr>
      <td><span class="cell-strong">${esc(s.productName)}</span><div class="cell-sub">${esc(s.sku || s.id)} · ${esc(s.category)} › ${esc(s.subcategory)}</div></td>
      <td>${esc(s.shop || "—")}</td>
      <td><div>${esc(s.recommendedVendor || "—")}</div><div class="cell-sub">was ${esc(s.currentVendor || "—")}</div></td>
      <td class="num"><span class="price-old">${fmt.money(s.currentUnitPrice, 2)}</span><div class="text-green cell-strong">${fmt.money(s.newUnitPrice, 2)}</div></td>
      <td class="num">${fmt.money(s.currentAnnualSpend)}</td>
      <td class="num">${fmt.money(s.newAnnualSpend)}</td>
      <td class="num text-green">${fmt.money(s.annualSavings)}</td>
      <td>${U.statusBadge(s.implementationStatus)}</td>
      <td><button class="btn btn-outline btn-sm" data-edit="${esc(s.id)}">✏️ Edit</button></td>
    </tr>`).join("");
    return `<div class="table-wrap"><table class="data"><thead><tr>
      <th>Product</th><th>Brand / Shop</th><th>Suppliers</th><th class="num">Price / Each</th><th class="num">Baseline spend</th><th class="num">Future spend</th><th class="num">Savings</th><th>Status</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="cell-sub" style="margin-top:8px">${skus.length} SKU(s), grouped by shop. Price / Each = current → negotiated unit price; baseline = price/each × annual qty.</div>`;
  }

  // Open the modal editor for one SKU. Admin-only; recomputes spend on save.
  function openSkuEditor(id, onSave) {
    const s = P.SKUS.find((x) => x.id === id);
    const overlay = document.getElementById("skuEditOverlay");
    if (!s || !overlay) return;
    const catOpts = Object.keys(P.SUBCATEGORIES).map((c) => `<option ${c === s.category ? "selected" : ""}>${esc(c)}</option>`).join("");
    const vendorList = P.VENDORS.map((v) => `<option value="${esc(v.vendorName)}">`).join("");
    const brandOpts = `<option value="">— Unassigned —</option>` +
      P.SHOPS.map((b) => `<option value="${esc(b.code)}" ${b.code === s.shopCode ? "selected" : ""}>${esc(b.shopName)} (${esc(b.code)})</option>`).join("");
    const statusOpts = P.STATUSES.map((st) => `<option ${st === s.implementationStatus ? "selected" : ""}>${esc(st)}</option>`).join("");
    const tierOpts = ["Economy", "Standard", "Luxury"].map((t) => `<option ${t === s.qualityTier ? "selected" : ""}>${esc(t)}</option>`).join("");
    const f = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
    overlay.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>Edit SKU · ${esc(s.sku || s.id)}</h3><button class="modal-x" data-close>✕</button></div>
      <div class="modal-body">
        ${f("Product name", `<input type="text" id="ed_productName" value="${esc(s.productName)}">`)}
        ${f("Description", `<input type="text" id="ed_description" value="${esc(s.description || "")}">`)}
        <div class="grid cols-2" style="gap:12px">
          ${f("Category", `<select id="ed_category">${catOpts}</select>`)}
          ${f("Subcategory", `<input type="text" id="ed_subcategory" value="${esc(s.subcategory || "")}">`)}
        </div>
        <div class="grid cols-2" style="gap:12px">
          ${f("Current vendor", `<input type="text" list="ed_vendors" id="ed_currentVendor" value="${esc(s.currentVendor || "")}">`)}
          ${f("Recommended vendor", `<input type="text" list="ed_vendors" id="ed_recommendedVendor" value="${esc(s.recommendedVendor || "")}">`)}
        </div>
        <datalist id="ed_vendors">${vendorList}</datalist>
        <div class="grid cols-3" style="gap:12px">
          ${f("Current unit price", `<input type="number" step="0.01" id="ed_currentUnitPrice" value="${s.currentUnitPrice}">`)}
          ${f("New unit price", `<input type="number" step="0.01" id="ed_newUnitPrice" value="${s.newUnitPrice}">`)}
          ${f("Annual quantity", `<input type="number" id="ed_annualQuantity" value="${s.annualQuantity}">`)}
        </div>
        <div class="grid cols-3" style="gap:12px">
          ${f("Brand", `<select id="ed_brand">${brandOpts}</select>`)}
          ${f("Quality tier", `<select id="ed_qualityTier">${tierOpts}</select>`)}
          ${f("Status", `<select id="ed_status">${statusOpts}</select>`)}
        </div>
        <div class="grid cols-2" style="gap:12px">
          ${f("Review owner", `<input type="text" id="ed_reviewOwner" value="${esc(s.reviewOwner || "")}" placeholder="e.g. A. Reyes">`)}
          ${f("Target date", `<input type="date" id="ed_targetDate" value="${esc(s.targetDate || "")}">`)}
        </div>
        <div class="grid cols-2" style="gap:12px">
          ${f("UOM", `<input type="text" id="ed_unitOfMeasure" value="${esc(s.unitOfMeasure || "")}">`)}
          ${f("Pack size", `<input type="text" id="ed_packSize" value="${esc(s.packSize || "")}">`)}
        </div>
        <div class="field" style="display:flex;gap:18px;align-items:center"><label class="check"><input type="checkbox" id="ed_preferred" ${s.preferredItem ? "checked" : ""}> Preferred</label><label class="check"><input type="checkbox" id="ed_contracted" ${s.contractedItem ? "checked" : ""}> Contracted</label></div>
        ${f("Notes", `<input type="text" id="ed_notes" value="${esc(s.notes || "")}">`)}
      </div>
      <div class="modal-foot"><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="ed_save">Save changes</button></div>
    </div>`;
    overlay.style.display = "flex";
    const close = () => { overlay.style.display = "none"; overlay.innerHTML = ""; };
    overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    const v = (id) => document.getElementById(id);
    v("ed_save").addEventListener("click", () => {
      const brandSel = v("ed_brand").value;
      const brand = P.SHOPS.find((b) => b.code === brandSel);
      const updated = P.updateSku(s.id, {
        productName: v("ed_productName").value.trim() || s.productName,
        description: v("ed_description").value.trim(),
        category: v("ed_category").value,
        subcategory: v("ed_subcategory").value.trim(),
        currentVendor: v("ed_currentVendor").value.trim(),
        recommendedVendor: v("ed_recommendedVendor").value.trim(),
        currentUnitPrice: +v("ed_currentUnitPrice").value || 0,
        newUnitPrice: +v("ed_newUnitPrice").value || 0,
        annualQuantity: +v("ed_annualQuantity").value || 0,
        unitOfMeasure: v("ed_unitOfMeasure").value.trim(),
        packSize: v("ed_packSize").value.trim(),
        qualityTier: v("ed_qualityTier").value,
        implementationStatus: v("ed_status").value,
        reviewOwner: v("ed_reviewOwner").value.trim(),
        targetDate: v("ed_targetDate").value,
        preferredItem: v("ed_preferred").checked,
        contractedItem: v("ed_contracted").checked,
        notes: v("ed_notes").value.trim(),
        shop: brand ? brand.shopName : "",
        shopCode: brand ? brand.code : "",
        region: brand ? brand.region : s.region,
      });
      close();
      if (onSave) onSave();
      // Persist this single SKU edit to the database.
      if (updated && window.Store && window.Store.available()) {
        window.Store.upsertSku(updated).catch((e) => alert("Saved in this session, but the database update failed: " + (e.message || e)));
      }
    });
  }

  PAGES.admin = {
    title: "Admin",
    crumb: "Admin",
    render() {
      const vendorOpts = P.VENDORS.map((v) => `<option>${esc(v.vendorName)}</option>`).join("");
      const catOpts = Object.keys(P.SUBCATEGORIES).map((c) => `<option>${esc(c)}</option>`).join("");
      const statusOpts = P.STATUSES.map((s) => `<option>${esc(s)}</option>`).join("");
      const brandOpts = `<option value="">➕ New brand…</option>` +
        P.SHOPS.map((s) => `<option value="${esc(s.code)}">${esc(s.shopName)} (${esc(s.code)})</option>`).join("");
      const regionListOpts = P.REGIONS.map((r) => `<option value="${esc(r)}">`).join("");
      return `
      <div class="page-head"><h1>Admin Console</h1><p>Upload pricing data, manage taxonomy, brands and vendors, edit SKUs, and import/export CSV. Built to support future AI auto-categorization.</p></div>
      <div class="notice" style="margin-bottom:18px">ℹ️ Uploads save to the shared database and appear on every tab for all signed-in users. If a tab looks stale, click <b>Publish to portal</b> to re-sync, then refresh.</div>

      <div class="card" style="margin-bottom:16px">
        <h3 class="card-title">🧭 Where should I upload this? <span class="cell-sub">— quick reminder</span></h3>
        <div class="table-wrap" style="border:none"><table class="data" style="min-width:640px"><thead><tr>
          <th>To populate…</th><th>Upload where</th><th>Format</th>
        </tr></thead><tbody>
          <tr><td><span class="cell-strong">Catalog</span><div class="cell-sub">Dashboard · Catalog · Shop View · Savings</div></td>
            <td>Admin → <b>Upload pricing data</b> (below)</td>
            <td class="cell-sub">Excel/CSV with a <b>Shop/Brand</b> column + product, price, qty</td></tr>
          <tr><td><span class="cell-strong">Vendor price books</span><div class="cell-sub">Vendors · Price Compliance</div></td>
            <td>Admin → <b>Upload contract</b> (below)</td>
            <td class="cell-sub">a contract / rate sheet (PDF, image, or Excel)</td></tr>
          <tr><td><span class="cell-strong">Vendor sales / invoiced spend</span><div class="cell-sub">Buying Patterns · Vendor Spend</div></td>
            <td><b><a href="#/vendorspend">Vendor Spend → Upload</a></b></td>
            <td class="cell-sub">dated lines: shop, SKU, vendor, date, amount, qty</td></tr>
        </tbody></table></div>
        <div class="cell-sub" style="margin-top:8px">Uploaded a contract but want it in the catalog? Use <b>Publish price book → catalog</b> on the <a href="#/vendors">Vendors</a> page.</div>
      </div>

      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div><h3 class="card-title" style="margin:0">🗃️ Dataset</h3>
          <div class="cell-sub" id="dataStatus">${P.SHOPS.length} brand(s) · ${P.SKUS.length} SKU(s) loaded.</div>
          <div class="cell-sub" id="publishMsg" style="margin-top:4px"></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="publishData">📤 Publish to portal</button>
          <button class="btn btn-outline btn-sm" id="loadSample">⬇ Load sample data</button>
          <button class="btn btn-outline btn-sm" id="clearData" style="color:var(--red);border-color:var(--red)">🗑 Clear all data</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 class="card-title">🧠 AI provider &amp; review</h3>
        <p class="text-muted" style="font-size:12.5px;margin:0 0 12px">Choose which model powers categorization, document OCR, and the savings review. API keys are stored server-side as Supabase secrets and never reach the browser — switching providers here never exposes a key.</p>
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="margin:0;min-width:200px"><label>AI provider</label>
            <select id="aiProvider">
              <option value="claude">Claude (Anthropic)</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </div>
          <div class="cell-sub" id="aiProviderStatus" style="padding-bottom:8px">Checking configured providers…</div>
          <button class="btn btn-primary btn-sm" id="aiReviewBtn" style="margin-left:auto">✨ Run AI savings review</button>
        </div>
        <div id="aiReviewResult" style="margin-top:12px"></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 class="card-title">📑 Upload vendor contract → price book</h3>
        <p class="text-muted" style="font-size:12.5px;margin:0 0 12px">Upload a vendor contract, rate sheet, or pricing schedule. Your selected AI provider reads it and builds a <b>Vendor Price Book</b> — the vendor's services &amp; products with per-each pricing, grouped by category — shown on the <a href="#/vendors">Vendors</a> page. PDF &amp; images use AI; Excel/CSV schedules are parsed directly. Word .docx: please export to PDF first.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0;min-width:240px"><label>Vendor name (optional override)</label><input type="text" id="contractVendor" placeholder="e.g. A1 American"></div>
          <label class="btn btn-primary btn-sm">Choose contract file<input type="file" id="contractFile" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.doc,.docx" hidden></label>
        </div>
        <div class="drop-zone" id="contractDrop" style="margin-top:12px"><div class="di">📑</div><div style="margin:6px 0">Drag &amp; drop a contract here</div><div class="cell-sub">.pdf · images · .xlsx · .csv</div></div>
        <div id="contractResult" style="margin-top:12px"></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 class="card-title">📑 Upload Shop-by-Shop master (per-tab)</h3>
        <p class="text-muted" style="font-size:12.5px;margin:0 0 10px">For multi-tab “shop-by-shop” workbooks (e.g. Disposables Master). Each shop tab between the <span class="mono">Shop Views »</span> separators is imported as that shop's catalog — the header row is auto-detected and each SKU's <b>winning / recommended vendor</b> is captured. Any <b>new vendor</b> is flagged for your confirmation before it's added to the vendor list.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0;min-width:200px"><label>Category for this file</label><input type="text" id="sbsCategory" value="Disposables"></div>
          <label class="btn btn-primary btn-sm">Choose workbook<input type="file" id="sbsFile" accept=".xlsx,.xls" hidden></label>
          <span class="cell-sub" id="sbsMsg"></span>
        </div>
        <div id="sbsResult" style="margin-top:12px"></div>
      </div>

      <div class="grid cols-2">
        <div class="card"><h3 class="card-title">🤖 Upload raw files — AI extraction</h3>
          <p class="text-muted" style="font-size:12.5px;margin:0 0 10px">Drop an Excel/CSV sheet <b>or</b> a photo/scan/PDF of a price list or invoice. Multi-tab workbooks are fully supported — every product tab is scanned, the header row is detected automatically, section/subtotal rows are ignored, and SKUs repeated across tabs are merged. Your selected AI provider (Claude or Gemini) fills in category, suppliers, SKU, baseline &amp; future spend, and more — review and edit below.</p>
          <div class="drop-zone" id="dropZone"><div class="di">📄</div><div style="margin:8px 0">Drag &amp; drop a file, or</div>
            <label class="btn btn-primary btn-sm">Choose file<input type="file" id="rawFile" accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.pdf" hidden></label>
            <div class="cell-sub" style="margin-top:8px">.xlsx · .csv · images · .pdf</div>
          </div>
          <div id="importResult" style="margin-top:12px"></div>
          <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="downloadTemplate">⬇ Download Excel template</button>
            <button class="btn btn-green btn-sm" id="exportAll">⬇ Export all SKUs (CSV)</button>
          </div>
          <div class="cell-sub" style="margin-top:8px">Recognized columns: ${P.CSV_TEMPLATE_COLUMNS.join(", ")} (extra columns are ignored; missing categories are inferred by AI).</div>
        </div>

        <div class="card"><h3 class="card-title">➕ Add / Edit SKU</h3>
          <div class="field"><label>Product name</label><input type="text" id="adProduct" placeholder="e.g. White Bath Towel 27x54"></div>
          <div class="grid cols-2" style="gap:12px">
            <div class="field"><label>Category</label><select id="adCategory">${catOpts}</select></div>
            <div class="field"><label>Subcategory</label><input type="text" id="adSub" placeholder="e.g. Towels"></div>
          </div>
          <div class="grid cols-2" style="gap:12px">
            <div class="field"><label>Current unit price</label><input type="number" id="adCur" step="0.01" placeholder="4.25"></div>
            <div class="field"><label>New unit price</label><input type="number" id="adNew" step="0.01" placeholder="3.15"></div>
          </div>
          <div class="grid cols-2" style="gap:12px">
            <div class="field"><label>Annual quantity</label><input type="number" id="adQty" placeholder="10000"></div>
            <div class="field"><label>Recommended vendor</label><select id="adVendor">${vendorOpts}</select></div>
          </div>
          <div class="grid cols-2" style="gap:12px">
            <div class="field" style="display:flex;gap:18px;align-items:center;margin-top:6px"><label class="check"><input type="checkbox" id="adPref"> Preferred</label><label class="check"><input type="checkbox" id="adContract"> Contracted</label></div>
            <div class="field"><label>Implementation status</label><select id="adStatus">${statusOpts}</select></div>
          </div>
          <button class="btn btn-primary" id="addSku">Add SKU to catalog</button>
          <div id="addResult" style="margin-top:10px"></div>
        </div>
      </div>

      <div class="grid cols-3" style="margin-top:16px">
        <div class="card"><h3 class="card-title">🗂️ Add Category / Subcategory</h3>
          <div class="field"><label>New category</label><input type="text" id="newCat" placeholder="e.g. Guest Amenities"></div>
          <div class="field"><label>New subcategory</label><input type="text" id="newSub" placeholder="e.g. Toiletries"></div>
          <button class="btn btn-outline btn-sm" id="addCat">Add</button>
          <div id="catResult" class="cell-sub" style="margin-top:8px"></div>
        </div>
        <div class="card"><h3 class="card-title">🏷️ Add Vendor</h3>
          <div class="field"><label>Vendor name</label><input type="text" id="newVendor" placeholder="e.g. Atlantic Supply Co"></div>
          <div class="field"><label>Contract status</label><select id="newVendorStatus"><option>Preferred</option><option>National Contract</option><option>In Negotiation</option></select></div>
          <button class="btn btn-outline btn-sm" id="addVendor">Add vendor</button>
          <div id="vendorResult" class="cell-sub" style="margin-top:8px"></div>
        </div>
        <div class="card"><h3 class="card-title">🏨 Add / Edit Brand</h3>
          <div class="field"><label>Brand to edit</label><select id="brandSelect">${brandOpts}</select></div>
          <div class="grid cols-2" style="gap:12px">
            <div class="field"><label>Brand name</label><input type="text" id="brandName" placeholder="e.g. Seaside Grand Hotel"></div>
            <div class="field"><label>Code</label><input type="text" id="brandCode" placeholder="e.g. Shop F"></div>
          </div>
          <div class="field"><label>Region</label><input type="text" list="regionList" id="brandRegion" placeholder="e.g. Southeast"><datalist id="regionList">${regionListOpts}</datalist></div>
          <button class="btn btn-primary btn-sm" id="saveBrand">Save brand</button>
          <div id="brandResult" class="cell-sub" style="margin-top:8px"></div>
        </div>
        <div class="card"><h3 class="card-title">📥 Import / Export</h3>
          <p class="text-muted" style="font-size:12.5px">Bulk import overwrites matching SKU IDs and appends new ones. Export produces a CSV using the standard template.</p>
          <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
            <label class="btn btn-outline btn-sm">Import CSV<input type="file" id="csvFile2" accept=".csv" hidden></label>
            <button class="btn btn-green btn-sm" id="exportAll2">Export CSV</button>
          </div>
          <div id="importResult2" style="margin-top:10px"></div>
        </div>
      </div>

      <div class="section-title" style="margin-top:24px">🛠️ SKU Editor <span class="badge" style="background:var(--navy-50);color:var(--navy);font-weight:600">Admin only</span></div>
      <div class="card">
        <div class="toolbar" style="margin-bottom:12px"><div class="field" style="margin:0;flex:1;min-width:260px"><label>Search SKUs</label><input type="text" id="skuSearch" placeholder="Search by product, SKU, category, vendor, or brand…"></div></div>
        <div id="skuTableWrap">${skuEditorTable(P.SKUS)}</div>
      </div>

      <div id="skuEditOverlay" class="modal-overlay" style="display:none"></div>`;
    },
    mount() {
      const isAdmin = () => ((window.CURRENT_USER || {}).role === "Procurement Admin");
      const setStatus = (html, kind) => {
        const el = document.getElementById("importResult");
        if (!el) return;
        const bg = kind === "err" ? "background:var(--red-bg,#fdecec);border-color:#f3c2c2;color:var(--red,#b42318)"
          : kind === "ok" ? "background:var(--green-bg);border-color:#bfe6cd;color:var(--green-700)" : "";
        el.innerHTML = `<div class="notice" style="${bg}">${html}</div>`;
      };
      const refreshDataset = () => {
        const ds = document.getElementById("dataStatus");
        if (ds) ds.textContent = `${P.SHOPS.length} brand(s) · ${P.SKUS.length} SKU(s) loaded.`;
        const wrap = document.getElementById("skuTableWrap");
        if (wrap) wrap.innerHTML = skuEditorTable(filteredSkus());
      };
      const filteredSkus = () => {
        const q = (document.getElementById("skuSearch") || {}).value || "";
        const t = q.trim().toLowerCase();
        if (!t) return P.SKUS;
        return P.SKUS.filter((s) => [s.id, s.sku, s.productName, s.category, s.subcategory, s.recommendedVendor, s.currentVendor, s.shop]
          .some((v) => String(v || "").toLowerCase().includes(t)));
      };

      // ---- Raw-file upload pipeline (Excel/CSV + image/PDF OCR via Claude) ----
      const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
      // Collapse newlines/repeated spaces in a header label so "Current\nPrice"
      // and "Current Price" resolve to the same key.
      const normKey = (h) => String(h == null ? "" : h).replace(/\s+/g, " ").trim().toLowerCase();
      const csvToObjects = (text) => {
        const rows = P.parseCsv(text);
        if (!rows.length) return [];
        const header = rows[0].map((h) => String(h).trim());
        return rows.slice(1)
          .filter((r) => r.some((c) => String(c).trim() !== ""))
          .map((r) => { const o = { __sheet: "CSV" }; header.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ""; }); return o; });
      };
      // Column names that identify the product name/description and the
      // brand/shop. Used to locate the header row and to tell real product rows
      // from section/subtotal rows.
      const NAME_KEYS = ["description", "product name", "product", "item name", "item", "sku description", "name"];
      const BRAND_KEYS = ["property", "shop", "brand", "property name"];
      // A row is the header row if it has a name column, a money/qty column, and
      // at least three recognizable headers overall.
      const looksLikeHeader = (cells) => {
        const keys = (cells || []).map(normKey).filter(Boolean);
        if (keys.length < 3) return false;
        const hasName = keys.some((k) => NAME_KEYS.includes(k) || k === "sku");
        const hasMoney = keys.some((k) => /(price|spend|qty|quantity|savings)/.test(k));
        const hits = keys.filter((k) => /(price|spend|qty|quantity|savings|category|sku|description|product|item|property|shop|brand|vendor|distributor)/.test(k)).length;
        return hasName && hasMoney && hits >= 3;
      };
      const valByKeys = (header, cells, names) => {
        for (const n of names) { const j = header.indexOf(n); if (j !== -1 && String(cells[j] == null ? "" : cells[j]).trim() !== "") return String(cells[j]).trim(); }
        return "";
      };
      // Pull product rows out of one worksheet grid (array-of-arrays). Detects
      // the header row, carries the brand/property down from section header rows,
      // and skips section headers, subtotal and grand-total rows. Returns the
      // rows found plus a `reason` when a sheet that looked like data was skipped.
      const extractSheet = (grid, sheetName) => {
        let hi = -1;
        for (let i = 0; i < Math.min(grid.length, 25); i++) { if (looksLikeHeader(grid[i])) { hi = i; break; } }
        if (hi === -1) return { rows: [] }; // not a product tab — silently ignore
        const header = grid[hi].map(normKey);
        if (!BRAND_KEYS.some((k) => header.includes(k))) return { rows: [], reason: "no Shop/Brand/Property column" };
        const rows = [];
        let carried = "";
        for (let i = hi + 1; i < grid.length; i++) {
          const cells = grid[i] || [];
          if (!cells.some((c) => String(c == null ? "" : c).trim() !== "")) continue;
          const name = valByKeys(header, cells, NAME_KEYS);
          const brand = valByKeys(header, cells, BRAND_KEYS);
          if (/(subtotal|grand total|^total\b)/i.test(name) || /(subtotal|grand total|^total\b)/i.test(brand)) continue;
          if (brand && !name) { carried = brand; continue; } // section header → remember its brand
          if (!name) continue; // not a product row
          const o = { __sheet: sheetName, __brand: brand || carried };
          header.forEach((h, j) => { if (h && o[h] === undefined) o[h] = cells[j] !== undefined ? cells[j] : ""; });
          rows.push(o);
        }
        return { rows };
      };
      const readSheet = (file) => new Promise((resolve, reject) => {
        const name = (file.name || "").toLowerCase();
        const r = new FileReader();
        r.onerror = () => reject(new Error("Could not read the file."));
        if (name.endsWith(".csv") || file.type === "text/csv") {
          r.onload = () => resolve({ rows: csvToObjects(String(r.result)), skipped: [] });
          r.readAsText(file);
        } else {
          r.onload = () => {
            if (!window.XLSX) { reject(new Error("Spreadsheet library failed to load. Check your connection and retry.")); return; }
            const wb = window.XLSX.read(new Uint8Array(r.result), { type: "array" });
            const rows = [], skipped = [];
            wb.SheetNames.forEach((sn) => {
              const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", blankrows: false });
              const res = extractSheet(grid, sn);
              res.rows.forEach((row) => rows.push(row));
              if (res.reason) skipped.push({ name: sn, reason: res.reason });
            });
            resolve({ rows, skipped });
          };
          r.readAsArrayBuffer(file);
        }
      });
      const rowToRecord = (row) => {
        const o = {}; Object.keys(row).forEach((k) => { o[normKey(k)] = row[k]; });
        const g = (names) => { for (const n of names) { if (o[n] !== undefined && String(o[n]).trim() !== "") return String(o[n]).trim(); } return ""; };
        const qty = num(g(["annual quantity", "annual qty", "quantity", "qty", "qty (units)", "units", "volume", "annual volume"]));
        let cur = num(g(["current unit price", "current price", "original price", "updated current price (hosp depot)", "bl wavg $/ea", "bl max $/ea", "old price", "baseline price", "list price", "unit price", "price"]));
        let nw = num(g(["new unit price", "a1 price", "new price", "winning b $/ea", "winning bid $/ea", "negotiated price", "quoted price", "proposed price", "future price", "price each"]));
        const baseSpend = num(g(["baseline spend", "baseline wavg ($)", "baseline max ($)", "current annual spend", "current spend", "annual spend"]));
        const futSpend = num(g(["future spend", "a1 spend", "new annual spend", "new spend ($)", "negotiated spend", "projected spend"]));
        if (!cur && baseSpend && qty) cur = P.round(baseSpend / qty);
        if (!nw && futSpend && qty) nw = P.round(futSpend / qty);
        return {
          sku: g(["sku", "sku id", "item number", "item #", "product code", "a1 sku"]),
          productName: g(["product name", "product", "item", "item name", "name", "description", "sku description"]),
          description: g(["description", "details", "long description"]),
          brand: g(["brand", "shop", "property", "property name", "location", "hotel", "site"]) || (o["__brand"] ? String(o["__brand"]).trim() : ""),
          region: g(["region", "area", "market"]),
          currentVendor: g(["current vendor", "existing vendor", "incumbent vendor", "current supplier"]),
          recommendedVendor: g(["recommended vendor", "new vendor", "winning vendor", "supplier", "vendor", "distributor", "proposed vendor"]),
          currentUnitPrice: cur, newUnitPrice: nw, annualQuantity: qty,
          unitOfMeasure: g(["uom", "unit of measure", "unit"]),
          packSize: g(["pack size", "pack", "case pack"]),
          category: g(["category"]),
          subcategory: g(["subcategory", "sub category", "sub-category"]),
          qualityTier: g(["quality tier", "tier", "grade"]),
          _sheet: row.__sheet || "",
        };
      };
      const fillCategories = async (records) => {
        const need = [], idxs = [];
        records.forEach((r, i) => { if (!r.category || !r.subcategory) { need.push(((r.productName || "") + " " + (r.description || "")).trim()); idxs.push(i); } });
        if (!need.length) return "none";
        let results, used = "Claude";
        try {
          setStatus(`🤖 Asking Claude to categorize ${need.length} item(s)…`);
          results = await window.AI.categorize(need);
        } catch (e) {
          used = "offline";
          setStatus(`⚠️ Claude unavailable (${esc(e.message)}). Falling back to the built-in categorizer…`);
          results = window.AI.categorizeLocal(need);
        }
        results.forEach((res, k) => {
          if (!res) return;
          const r = records[idxs[k]];
          r.category = r.category || res.category;
          r.subcategory = r.subcategory || res.subcategory;
          r.qualityTier = r.qualityTier || res.qualityTier;
        });
        return used;
      };
      const finishImport = async (res, label) => {
        refreshDataset();
        const summary = `imported <b>${res.added}</b> SKU(s)${res.brandsCreated ? `, created <b>${res.brandsCreated}</b> new brand(s)` : ""}. Catalog now has ${res.totalSkus} SKU(s) across ${res.totalBrands} brand(s)`;
        if (window.Store && window.Store.available()) {
          setStatus(`✅ ${label}: ${summary}. 💾 Saving to database…`, "ok");
          try { await window.Store.pushAll(); setStatus(`✅ ${label}: ${summary} — saved to the database. Review and edit below.`, "ok"); }
          catch (e) { setStatus(`⚠️ ${label}: ${summary} in this session, but saving to the database failed: ${esc(e.message)}`, "err"); }
        } else {
          setStatus(`✅ ${label}: ${summary} (session only). Review and edit below.`, "ok");
        }
      };
      // How "complete" a record is — used to keep the richest copy when the same
      // SKU shows up on more than one tab.
      const recScore = (r) => (r.currentUnitPrice > 0 ? 1 : 0) + (r.newUnitPrice > 0 ? 1 : 0) + (r.annualQuantity > 0 ? 1 : 0) + (r.sku ? 1 : 0);
      const processSheet = async (file) => {
        setStatus("⏳ Reading every tab…");
        // Guard: a shop-by-shop master workbook must use the dedicated importer,
        // otherwise its per-tab layout gets mis-read (totals as prices, etc.).
        try {
          const wb0 = XLSX.read(await file.arrayBuffer(), { type: "array" });
          if (wb0.SheetNames.some((n) => />>/.test(n) || /shop views/i.test(n))) {
            setStatus("This looks like a Shop-by-Shop master workbook. Please use the “📑 Upload Shop-by-Shop master” button above so each tab maps to the correct shop and the recommended vendor is captured.", "err");
            return;
          }
        } catch (_) { /* fall through to normal parse */ }
        const { rows, skipped } = await readSheet(file);
        const records = rows.map(rowToRecord).filter((r) => r.productName);
        if (!records.length) {
          const hint = (skipped && skipped.length)
            ? ` Tabs that looked like data were skipped because they have ${esc(skipped[0].reason)} — add a Shop/Brand/Property column.`
            : " Each product tab needs a header row with columns like Description/Product Name, a price (e.g. Current Price or A1 Price), Qty, and a Shop/Brand/Property column.";
          setStatus("No product rows found." + hint, "err");
          return;
        }
        // Per-tab tally before de-duplication.
        const byTab = {};
        records.forEach((r) => { const t = (r._sheet || "Sheet").trim(); byTab[t] = (byTab[t] || 0) + 1; });
        // Collapse rows that repeat across tabs — same brand, SKU, product, AND
        // the same quantity and pricing. Quantity/price are part of the key on
        // purpose: a shop can legitimately list the same SKU more than once at
        // different volumes/prices, and those are distinct line items, not dupes.
        const r3 = (n) => Math.round((+n || 0) * 1000) / 1000;
        const seen = new Map();
        const deduped = [];
        records.forEach((r) => {
          const key = [(r.brand || "").toLowerCase().replace(/\s+/g, " ").trim(),
                       (r.sku || "").toLowerCase().trim(),
                       (r.productName || "").toLowerCase().replace(/\s+/g, " ").trim(),
                       r3(r.annualQuantity), r3(r.currentUnitPrice), r3(r.newUnitPrice)].join("|");
          const prev = seen.get(key);
          if (prev === undefined) { seen.set(key, deduped.length); deduped.push(r); return; }
          if (recScore(r) > recScore(deduped[prev])) deduped[prev] = r;
        });
        const dupes = records.length - deduped.length;
        const tabs = Object.keys(byTab);
        const tabList = tabs.slice(0, 8).map((t) => `${esc(t)} (${byTab[t]})`).join(", ") + (tabs.length > 8 ? `, +${tabs.length - 8} more` : "");
        setStatus(`⏳ Found ${records.length} product row(s) across ${tabs.length} tab(s): ${tabList}.${dupes ? ` Merging ${dupes} duplicate(s) → ${deduped.length} unique SKU(s).` : ""}${skipped && skipped.length ? ` Skipped ${skipped.length} non-product tab(s).` : ""} Categorizing…`);
        const used = await fillCategories(deduped);
        const aiNote = used === "Claude" ? "Spreadsheet + Claude AI categorization"
          : used === "offline" ? "Spreadsheet (offline categorizer — Claude unavailable)"
          : "Spreadsheet (rows already categorized, no AI needed)";
        const label = `${aiNote} · ${tabs.length} tab(s)${dupes ? `, ${dupes} duplicate row(s) merged` : ""}`;
        await finishImport(P.importRecords(deduped), label);
      };
      const processOcr = async (file) => {
        setStatus("🤖 Claude is reading the document (OCR)… this can take a few seconds.");
        let items;
        try {
          items = await window.AI.ocr(file);
        } catch (e) {
          setStatus(`❌ ${esc(e.message)}`, "err");
          return;
        }
        const records = (items || []).map((it) => ({
          productName: it.productName, description: it.description || "",
          brand: it.brand || "", region: it.region || "",
          currentVendor: it.currentVendor || "", recommendedVendor: it.recommendedVendor || "",
          currentUnitPrice: num(it.currentUnitPrice), newUnitPrice: num(it.newUnitPrice), annualQuantity: num(it.annualQuantity),
          unitOfMeasure: it.unitOfMeasure || "", packSize: it.packSize || "",
          category: it.category || "", subcategory: it.subcategory || "", qualityTier: it.qualityTier || "",
        })).filter((r) => r.productName);
        if (!records.length) { setStatus("Claude didn't find any product line items in that file.", "err"); return; }
        await fillCategories(records);
        await finishImport(P.importRecords(records), "Claude OCR");
      };
      const processRawFile = async (file) => {
        if (!file) return;
        if (!isAdmin()) { setStatus("Only a Procurement Admin can upload data.", "err"); return; }
        const name = (file.name || "").toLowerCase();
        const isSheet = /\.(xlsx|xls|csv)$/.test(name) || /sheet|excel|csv/.test(file.type);
        const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
        const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif)$/.test(name);
        try {
          if (isSheet) await processSheet(file);
          else if (isImg || isPdf) await processOcr(file);
          else setStatus("Unsupported file type. Upload .xlsx, .csv, an image, or a PDF.", "err");
        } catch (e) {
          setStatus(`❌ ${esc(e.message || e)}`, "err");
        }
      };

      // ---- Shop-by-Shop master importer (tab-by-tab) ----
      const newVendorConfirmHTML = (news) => {
        const cats = P.VENDOR_CATEGORIES;
        return `<div class="card" style="border-left:3px solid var(--sand)">
          <h3 class="card-title">🆕 New vendors found — confirm before adding (${news.length})</h3>
          <p class="cell-sub" style="margin-top:-4px">These recommended vendors aren't in your vendor list yet. Pick a category and add the ones you want.</p>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:480px"><thead><tr><th></th><th>Vendor</th><th>Category</th></tr></thead><tbody>
          ${news.map((n, i) => `<tr><td><input type="checkbox" class="nv-chk" data-i="${i}" checked></td><td class="cell-strong" data-nv="${i}">${esc(n)}</td><td><select class="approve-select nv-cat" data-i="${i}" style="max-width:none">${cats.map((c) => `<option ${c === "Supplies & Equipment" ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></td></tr>`).join("")}
          </tbody></table></div>
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="btn btn-primary btn-sm" id="nvAdd">Add selected to vendor list</button><button class="btn btn-outline btn-sm" id="nvDismiss">Dismiss</button><span class="cell-sub" id="nvMsg"></span></div>
        </div>`;
      };
      const wireNewVendorConfirm = (res) => {
        const dis = res.querySelector("#nvDismiss"); if (dis) dis.addEventListener("click", () => { res.innerHTML = ""; });
        const add = res.querySelector("#nvAdd"); if (add) add.addEventListener("click", async () => {
          let n = 0;
          res.querySelectorAll(".nv-chk:checked").forEach((ch) => {
            const i = ch.getAttribute("data-i");
            const name = res.querySelector(`[data-nv="${i}"]`).textContent;
            const cat = res.querySelector(`.nv-cat[data-i="${i}"]`).value;
            if (P.addVendorRecord({ name, category: cat })) n++;
          });
          try { if (window.Store && window.Store.available()) await window.Store.saveVendors(P.vendorMaster()); } catch (_) { /* ignore */ }
          const mm = res.querySelector("#nvMsg"); if (mm) mm.innerHTML = `<span class="text-green">✅ Added ${n} vendor(s) to the master.</span>`;
          setTimeout(() => { res.innerHTML = ""; }, 1600);
        });
      };
      const sbsFile = document.getElementById("sbsFile");
      if (sbsFile) sbsFile.addEventListener("change", async () => {
        const f = sbsFile.files && sbsFile.files[0]; sbsFile.value = "";
        if (!f) return;
        if (!isAdmin()) return;
        const msg = document.getElementById("sbsMsg"); const res = document.getElementById("sbsResult");
        msg.textContent = "Reading " + f.name + " (tab by tab)…";
        try {
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          const sheets = wb.SheetNames.map((sn) => ({ name: sn, rows: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" }) }));
          const cat = (document.getElementById("sbsCategory").value || "Disposables").trim() || "Disposables";
          const out = P.importShopByShopWorkbook(sheets, { category: cat });
          if (!out.records.length) { msg.innerHTML = `<span class="text-red">No shop tabs with SKU + price columns were found.</span>`; return; }
          const imp = P.importRecords(out.records);
          refreshDataset();
          if (window.Store && window.Store.available()) { try { await window.Store.pushAll(); } catch (_) { /* ignore */ } }
          msg.innerHTML = `<span class="text-green">✅ Imported ${imp.added} SKU(s) from ${out.sheetsUsed.length} shop tab(s) as “${esc(cat)}”${imp.brandsCreated ? `, created ${imp.brandsCreated} shop(s)` : ""}.</span>`;
          const news = P.newVendorsAmong(out.vendors);
          if (news.length) { res.innerHTML = newVendorConfirmHTML(news); wireNewVendorConfirm(res); }
          else { res.innerHTML = `<div class="cell-sub">Recommended vendors seen: ${out.vendors.map(esc).join(", ") || "—"} — all already in your vendor list.</div>`; }
        } catch (e) { msg.innerHTML = `<span class="text-red">⚠️ ${esc(e.message || e)}</span>`; }
      });

      // ---- AI provider toggle + savings review ----
      const aiSel = document.getElementById("aiProvider");
      const aiStatus = document.getElementById("aiProviderStatus");
      if (aiSel && window.AI) {
        aiSel.value = window.AI.getProvider();
        aiSel.addEventListener("change", () => window.AI.setProvider(aiSel.value));
        window.AI.providers().then((p) => {
          const tag = (on) => on ? "✅ configured" : "⚠️ no key";
          if (aiStatus) aiStatus.innerHTML = `Claude: ${tag(p.claude)} · Gemini: ${tag(p.gemini)}`;
          Array.from(aiSel.options).forEach((o) => {
            const ok = o.value === "gemini" ? p.gemini : p.claude;
            o.disabled = !ok;
            if (!ok) o.text += " — add API key";
          });
          if (!p[aiSel.value]) { const fb = p.claude ? "claude" : (p.gemini ? "gemini" : ""); if (fb) { aiSel.value = fb; window.AI.setProvider(fb); } }
        }).catch((e) => { if (aiStatus) aiStatus.textContent = "Could not check providers: " + e.message; });
      }
      const buildReviewStats = () => {
        const agg = P.aggregate(P.SKUS);
        const byKey = (key) => {
          const m = {};
          P.SKUS.forEach((s) => { const k = s[key] || "—"; (m[k] = m[k] || { spend: 0, savings: 0, skus: 0 }); m[k].spend += s.currentAnnualSpend; m[k].savings += s.annualSavings; m[k].skus++; });
          return Object.keys(m).map((k) => ({ name: k, spend: m[k].spend, savings: m[k].savings, skus: m[k].skus }))
            .sort((a, b) => b.savings - a.savings).slice(0, 8)
            .map((r) => ({ name: r.name, currentSpend: Math.round(r.spend), savings: Math.round(r.savings), skus: r.skus }));
        };
        const priceIncreases = P.SKUS.filter((s) => s.newUnitPrice > s.currentUnitPrice && s.currentUnitPrice > 0)
          .sort((a, b) => (b.newUnitPrice - b.currentUnitPrice) - (a.newUnitPrice - a.currentUnitPrice)).slice(0, 8)
          .map((s) => ({ sku: s.sku || s.id, product: s.productName, shop: s.shop, currentEach: s.currentUnitPrice, newEach: s.newUnitPrice }));
        return {
          totals: { currentSpend: Math.round(agg.baselineSpend), newSpend: Math.round(agg.newSpend), savings: Math.round(agg.savingsOpportunity), savingsPct: agg.savingsPercentage, skuCount: agg.skuCount, brandCount: P.SHOPS.length },
          topShops: byKey("shop"), topCategories: byKey("category"), priceIncreases,
        };
      };
      const aiBtn = document.getElementById("aiReviewBtn");
      if (aiBtn) aiBtn.addEventListener("click", async () => {
        const out = document.getElementById("aiReviewResult");
        if (!P.SKUS.length) { if (out) out.innerHTML = `<div class="notice">Upload or load data first.</div>`; return; }
        aiBtn.disabled = true;
        if (out) out.innerHTML = `<div class="cell-sub">✨ ${esc(window.AI.getProvider() === "gemini" ? "Gemini" : "Claude")} is reviewing the catalog…</div>`;
        try {
          const text = await window.AI.analyze(buildReviewStats());
          if (out) out.innerHTML = `<div class="notice" style="white-space:pre-wrap;background:#eef4ff;border-color:#cfe0ff">${esc(text)}</div>`;
        } catch (e) {
          if (out) out.innerHTML = `<div class="notice" style="background:#fdeaea;border-color:#f3c2c2;color:var(--red)">❌ ${esc(e.message)}</div>`;
        } finally { aiBtn.disabled = false; }
      });

      // ---- Vendor contract → price book ----
      const setContractStatus = (msg, kind) => {
        const el = document.getElementById("contractResult");
        if (!el) return;
        const bg = kind === "ok" ? "background:var(--green-bg);border-color:#bfe6cd;color:var(--green-700)"
          : kind === "err" ? "background:#fdeaea;border-color:#f3c2c2;color:var(--red)" : "";
        el.innerHTML = `<div class="notice" style="${bg}">${msg}</div>`;
      };
      // Parse a contract pricing schedule (Excel/CSV) without requiring a shop column.
      const readContractSheet = (file) => new Promise((resolve, reject) => {
        const nm = (file.name || "").toLowerCase();
        const r = new FileReader();
        r.onerror = () => reject(new Error("Could not read the file."));
        if (nm.endsWith(".csv") || file.type === "text/csv") { r.onload = () => resolve(csvToObjects(String(r.result))); r.readAsText(file); }
        else {
          r.onload = () => {
            if (!window.XLSX) { reject(new Error("Spreadsheet library failed to load.")); return; }
            const wb = window.XLSX.read(new Uint8Array(r.result), { type: "array" });
            const out = [];
            wb.SheetNames.forEach((sn) => {
              const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", blankrows: false });
              let hi = -1;
              for (let i = 0; i < Math.min(grid.length, 25); i++) { if (looksLikeHeader(grid[i])) { hi = i; break; } }
              if (hi < 0) return;
              const header = grid[hi].map(normKey);
              for (let i = hi + 1; i < grid.length; i++) {
                const cells = grid[i] || [];
                if (!cells.some((c) => String(c == null ? "" : c).trim() !== "")) continue;
                const o = {}; header.forEach((h, j) => { if (h && o[h] === undefined) o[h] = cells[j] !== undefined ? cells[j] : ""; });
                out.push(o);
              }
            });
            resolve(out);
          };
          r.readAsArrayBuffer(file);
        }
      });
      const contractItemFromRow = (row) => {
        const o = {}; Object.keys(row).forEach((k) => { o[normKey(k)] = row[k]; });
        const g = (names) => { for (const n of names) { if (o[n] !== undefined && String(o[n]).trim() !== "") return String(o[n]).trim(); } return ""; };
        return {
          name: g(["service", "item", "product", "product name", "name", "description"]),
          description: g(["description", "details", "long description"]),
          category: g(["category"]),
          subcategory: g(["subcategory", "sub category", "sub-category"]),
          unitPrice: num(g(["price each", "price/each", "unit price each", "unit price", "contract price", "rate", "price", "each"])),
          uom: g(["uom", "unit of measure", "unit"]),
          packSize: g(["pack size", "pack", "case pack"]),
          notes: g(["notes", "comments"]),
        };
      };
      const renderContractPreview = (c) => {
        const el = document.getElementById("contractResult");
        if (!el) return;
        const byCat = {};
        c.items.forEach((it) => { (byCat[it.category] = byCat[it.category] || []).push(it); });
        const blocks = Object.keys(byCat).sort().map((cat) => `
          <div style="margin-top:8px"><div class="cell-strong">${esc(cat)}</div>
          ${byCat[cat].map((it) => `<div class="cell-sub" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(it.name)}${it.uom && it.uom !== "Each" ? ` <span class="badge navy" style="font-size:9px">${esc(it.uom)}</span>` : ""}</span><span class="mono">${fmt.money(it.unitPrice, 2)}</span></div>`).join("")}</div>`).join("");
        el.innerHTML += `<div class="card" style="margin-top:10px"><h4 style="margin:0 0 4px">${esc(c.vendorName)} · price book${c.effectiveDate ? ` <span class="cell-sub">(eff. ${esc(c.effectiveDate)}${c.expirationDate ? "–" + esc(c.expirationDate) : ""})</span>` : ""}</h4>${blocks}</div>`;
      };
      const processContract = async (file) => {
        if (!file) return;
        if (!isAdmin()) { setContractStatus("Only a Procurement Admin can upload contracts.", "err"); return; }
        const nm = (file.name || "").toLowerCase();
        const vendorOverride = ((document.getElementById("contractVendor") || {}).value || "").trim();
        const baseName = (file.name || "contract").replace(/\.[^.]+$/, "");
        if (/\.(docx?|doc)$/.test(nm)) { setContractStatus("Word documents can't be read in the browser. Please export the contract to PDF and re-upload.", "err"); return; }
        let extracted;
        try {
          if (/\.(xlsx|xls|csv)$/.test(nm) || /sheet|excel|csv/.test(file.type)) {
            setContractStatus("⏳ Reading pricing schedule…");
            const rows = await readContractSheet(file);
            extracted = { vendorName: vendorOverride || baseName, title: baseName, items: rows.map(contractItemFromRow) };
          } else if (/\.(pdf|png|jpe?g|webp|gif)$/.test(nm) || /^image\//.test(file.type) || file.type === "application/pdf") {
            setContractStatus(`🤖 ${esc(window.AI.getProvider() === "gemini" ? "Gemini" : "Claude")} is reading the contract…`);
            extracted = await window.AI.contractExtract(file);
          } else { setContractStatus("Unsupported file. Upload a PDF, image, or Excel/CSV.", "err"); return; }
        } catch (e) { setContractStatus(`❌ ${esc(e.message || e)}`, "err"); return; }
        if (vendorOverride) extracted.vendorName = vendorOverride;
        extracted.source = file.name || "";
        // Fallback: if the contract pass found no priced lines (common when the
        // PDF is encrypted/image-only with pricing in an Exhibit A table), render
        // each page to an image and OCR it — vision reads the scanned tables and
        // divides packs/cases down to a per-each price.
        const noItems = () => !(extracted.items || []).some((i) => (i.name && String(i.name).trim()) || i.unitPrice);
        const ocrItemsToContract = (items) => items.map((it) => ({
          name: it.productName, description: it.description || "",
          category: it.category, subcategory: it.subcategory,
          unitPrice: +it.currentUnitPrice || +it.newUnitPrice || 0,
          uom: it.unitOfMeasure || "Each", packSize: it.packSize || "",
        }));
        const isPdfOrImg = /\.(pdf|png|jpe?g|webp|gif)$/.test(nm) || /^image\//.test(file.type) || file.type === "application/pdf";
        if (noItems() && isPdfOrImg) {
          const isPdf = file.type === "application/pdf" || nm.endsWith(".pdf");
          try {
            if (isPdf && window.pdfjsLib) {
              const pages = await pdfToImages(file, 40, (i, n) => setContractStatus(`🖼️ Rendering page ${i} of ${n}…`));
              let items = [];
              for (let i = 0; i < pages.length; i++) {
                setContractStatus(`🤖 Reading pricing on page ${i + 1} of ${pages.length}…`);
                try { items = items.concat(await window.AI.ocrImage(pages[i].mediaType, pages[i].data) || []); } catch (_) { /* skip page */ }
              }
              if (items.length) { extracted.items = ocrItemsToContract(items); if (!extracted.vendorName) extracted.vendorName = vendorOverride || baseName; }
            } else {
              setContractStatus("Reading the pricing tables line-by-line…");
              const items = await window.AI.ocr(file);
              if (items && items.length) { extracted.items = ocrItemsToContract(items); if (!extracted.vendorName) extracted.vendorName = vendorOverride || baseName; }
            }
          } catch (_) { /* fall to message below */ }
        }
        if (noItems()) {
          setContractStatus("No priced line items were found in that contract.", "err"); return;
        }
        const res = P.importContract(extracted);
        refreshDataset();
        if (window.Store && window.Store.available()) {
          setContractStatus(`✅ ${esc(res.vendorName)}: ${res.itemCount} item(s) across ${res.categories.length} categor${res.categories.length === 1 ? "y" : "ies"}. 💾 Saving…`, "ok");
          try { await window.Store.upsertContract(res.contract); setContractStatus(`✅ Price book saved for <b>${esc(res.vendorName)}</b> — ${res.itemCount} item(s). See the <a href="#/vendors">Vendors</a> page.`, "ok"); }
          catch (e) { setContractStatus(`⚠️ ${esc(res.vendorName)}: imported ${res.itemCount} item(s) this session, but DB save failed: ${esc(e.message)}`, "err"); }
        } else {
          setContractStatus(`✅ Price book for <b>${esc(res.vendorName)}</b> — ${res.itemCount} item(s) (session only). See the <a href="#/vendors">Vendors</a> page.`, "ok");
        }
        renderContractPreview(res.contract);
        // Flag same-vendor duplicates introduced by this upload.
        const dups = P.vendorDuplicates(res.vendorName);
        if (dups.length) {
          const el = document.getElementById("contractResult");
          if (el) el.innerHTML += `<div class="notice" style="background:var(--red-bg);border-color:#f3c9c9;color:var(--red);margin-top:10px">🚩 ${dups.length} possible duplicate item(s) for <b>${esc(res.vendorName)}</b> — same SKU/product seen more than once (sometimes at different prices). Review on the <a href="#/quality">Data Quality</a> page.</div>`;
        }
      };
      const contractInput = document.getElementById("contractFile");
      if (contractInput) contractInput.addEventListener("change", () => { processContract(contractInput.files[0]); contractInput.value = ""; });
      const cDrop = document.getElementById("contractDrop");
      if (cDrop) {
        cDrop.addEventListener("dragover", (e) => { e.preventDefault(); cDrop.style.borderColor = "var(--navy)"; });
        cDrop.addEventListener("dragleave", () => { cDrop.style.borderColor = ""; });
        cDrop.addEventListener("drop", (e) => { e.preventDefault(); cDrop.style.borderColor = ""; processContract(e.dataTransfer.files[0]); });
      }

      const rawInput = document.getElementById("rawFile");
      if (rawInput) rawInput.addEventListener("change", () => { processRawFile(rawInput.files[0]); rawInput.value = ""; });
      const csv2 = document.getElementById("csvFile2");
      if (csv2) csv2.addEventListener("change", () => {
        const f = csv2.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = importCsv(reader.result);
          const el = document.getElementById("importResult2");
          if (el) el.innerHTML = `<div class="notice" style="background:var(--green-bg);border-color:#bfe6cd;color:var(--green-700)">✅ Imported. ${result.added} added, ${result.updated} updated. Catalog now has ${P.SKUS.length} SKUs.${window.Store && window.Store.available() ? " 💾 Saving…" : ""}</div>`;
          refreshDataset();
          if (window.Store && window.Store.available()) window.Store.pushAll().then(() => { if (el) el.innerHTML = el.innerHTML.replace("💾 Saving…", "💾 Saved."); }).catch((e) => { if (el) el.innerHTML += `<div class="text-red">⚠️ DB save failed: ${esc(e.message)}</div>`; });
        };
        reader.readAsText(f); csv2.value = "";
      });
      const dz = document.getElementById("dropZone");
      if (dz) {
        dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "var(--navy)"; });
        dz.addEventListener("dragleave", () => { dz.style.borderColor = ""; });
        dz.addEventListener("drop", (e) => { e.preventDefault(); dz.style.borderColor = ""; processRawFile(e.dataTransfer.files[0]); });
      }

      // ---- SKU editor: search + edit (admin only) ----
      const search = document.getElementById("skuSearch");
      if (search) search.addEventListener("input", () => { const w = document.getElementById("skuTableWrap"); if (w) w.innerHTML = skuEditorTable(filteredSkus()); });
      const tableWrap = document.getElementById("skuTableWrap");
      if (tableWrap) tableWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-edit]");
        if (!btn) return;
        if (!isAdmin()) { alert("Only a Procurement Admin can edit SKUs."); return; }
        openSkuEditor(btn.getAttribute("data-edit"), refreshDataset);
      });

      const dl = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener("click", fn); };
      dl("downloadTemplate", () => downloadCsv(P.CSV_TEMPLATE_COLUMNS.join(",") + "\n", "sku-template.csv"));
      dl("exportAll", () => downloadCsv(P.skusToCsv(P.SKUS), "all-skus.csv"));
      dl("exportAll2", () => downloadCsv(P.skusToCsv(P.SKUS), "all-skus.csv"));
      dl("addSku", () => {
        const g = (id) => document.getElementById(id);
        const name = g("adProduct").value.trim();
        if (!name) { g("addResult").innerHTML = '<span class="text-red">Product name is required.</span>'; return; }
        const cur = +g("adCur").value || 0, nw = +g("adNew").value || 0, qty = +g("adQty").value || 0;
        const ai = P.categorize(name + " " + g("adSub").value);
        const sku = {
          id: "SKU-" + String(P.SKUS.length + 1).padStart(3, "0"), productName: name, description: name,
          category: g("adCategory").value, subcategory: g("adSub").value || ai.subcategory,
          currentVendor: "Current Local Vendor", recommendedVendor: g("adVendor").value,
          currentUnitPrice: cur, newUnitPrice: nw, unitOfMeasure: "Each", packSize: "—", annualQuantity: qty,
          currentAnnualSpend: P.round(cur * qty), newAnnualSpend: P.round(nw * qty),
          annualSavings: P.round((cur - nw) * qty), savingsPercentage: cur ? P.round((cur - nw) / cur * 100, 1) : 0,
          shop: (P.SHOPS[0] || {}).shopName || "", shopCode: (P.SHOPS[0] || {}).code || "", region: (P.SHOPS[0] || {}).region || "",
          qualityTier: ai.qualityTier, implementationStatus: g("adStatus").value,
          preferredItem: g("adPref").checked, contractedItem: g("adContract").checked, imageUrl: "", notes: "Added via admin console.",
        };
        P.SKUS.push(sku);
        refreshDataset();
        g("addResult").innerHTML = `<div class="notice" style="background:var(--green-bg);border-color:#bfe6cd;color:var(--green-700)">✅ ${esc(sku.id)} added. AI suggested <b>${esc(ai.category)} · ${esc(ai.subcategory)}</b> (${esc(ai.confidence)}).</div>`;
        if (window.Store && window.Store.available()) window.Store.upsertSku(sku).catch((e) => { g("addResult").innerHTML += `<div class="text-red" style="margin-top:6px">⚠️ Database save failed: ${esc(e.message)}</div>`; });
      });
      dl("addCat", () => {
        const c = document.getElementById("newCat").value.trim(), s = document.getElementById("newSub").value.trim();
        if (c && !P.SUBCATEGORIES[c]) { P.SUBCATEGORIES[c] = []; P.CATEGORY_META[c] = { icon: "📦", color: "var(--navy)" }; }
        if (c && s) P.SUBCATEGORIES[c].push(s);
        document.getElementById("catResult").textContent = `Added ${c}${s ? " · " + s : ""}. Categories: ${Object.keys(P.SUBCATEGORIES).length}.`;
      });
      dl("addVendor", () => {
        const v = document.getElementById("newVendor").value.trim();
        if (v) { P.VENDORS.push({ vendorName: v, categories: [], contractStatus: document.getElementById("newVendorStatus").value, pricingStatus: "Proposed", notes: "Added via admin console." });
          document.getElementById("vendorResult").textContent = `Added ${v}. Vendors: ${P.VENDORS.length}.`; }
      });

      // ---- Dataset: load sample / clear all ----
      const persistBulk = async (verb) => {
        if (!(window.Store && window.Store.available())) { if (window.App) window.App.renderCurrent(); return; }
        setStatus(`💾 ${verb} and saving to database…`, "ok");
        try { await window.Store.pushAll(); } catch (e) { alert("Applied in this session, but the database write failed: " + (e.message || e)); }
        if (window.App) window.App.renderCurrent();
      };
      // Force-publish the full in-memory dataset to the shared database so it
      // shows on every tab and for every user (catalog, brands, AP, vendors).
      dl("publishData", async () => {
        const msg = document.getElementById("publishMsg");
        if (!(window.Store && window.Store.available())) { if (msg) msg.innerHTML = `<span class="text-amber">Not connected to the database — sign in to publish.</span>`; return; }
        if (msg) msg.textContent = "📤 Publishing to the portal…";
        try {
          await window.Store.pushAll();                                   // brands + SKUs
          if (window.Store.pushAp) await window.Store.pushAp();           // AP / vendor spend
          if (window.Store.saveVendors && P.vendorMaster) await window.Store.saveVendors(P.vendorMaster());
          if (msg) msg.innerHTML = `<span class="text-green">✅ Published — ${P.SHOPS.length} brand(s), ${P.SKUS.length} SKU(s) are now live on every tab. Other users should refresh.</span>`;
        } catch (e) {
          if (msg) msg.innerHTML = `<span class="text-red">⚠️ Publish failed: ${esc(e.message || e)}</span>`;
        }
      });
      dl("loadSample", async () => { P.loadSampleData(); await persistBulk("Loaded sample data"); });
      dl("clearData", async () => {
        if (!confirm("Remove ALL brands and SKUs (including saved data in the database)? You can reload sample data afterwards.")) return;
        P.clearAll();
        await persistBulk("Cleared all data");
      });

      // ---- Brand (shop / property) create + edit ----
      const brandSel = document.getElementById("brandSelect");
      const bName = document.getElementById("brandName"), bCode = document.getElementById("brandCode"), bRegion = document.getElementById("brandRegion");
      const fillBrandForm = () => {
        const b = P.SHOPS.find((s) => s.code === brandSel.value);
        bName.value = b ? b.shopName : "";
        bCode.value = b ? b.code : P.nextBrandCode();
        bRegion.value = b ? b.region : "";
      };
      const rebuildBrandOptions = (selectCode) => {
        brandSel.innerHTML = `<option value="">➕ New brand…</option>` +
          P.SHOPS.map((s) => `<option value="${esc(s.code)}">${esc(s.shopName)} (${esc(s.code)})</option>`).join("");
        brandSel.value = selectCode || "";
      };
      if (brandSel) { brandSel.addEventListener("change", fillBrandForm); fillBrandForm(); }
      dl("saveBrand", () => {
        const res = P.upsertBrand({ originalCode: brandSel.value, shopName: bName.value, code: bCode.value, region: bRegion.value });
        const el = document.getElementById("brandResult");
        if (!res.ok) { el.innerHTML = `<span class="text-red">${esc(res.error)}</span>`; return; }
        rebuildBrandOptions(res.brand.code);
        refreshDataset();
        el.innerHTML = `<div class="notice" style="background:var(--green-bg);border-color:#bfe6cd;color:var(--green-700)">✅ Brand <b>${esc(res.brand.shopName)}</b> (${esc(res.brand.code)}) ${res.mode}. Brands: ${P.SHOPS.length}.</div>`;
        // A rename fans out to every SKU on that brand, so persist full state.
        if (window.Store && window.Store.available()) {
          window.Store.pushAll().catch((e) => { el.innerHTML += `<div class="text-red" style="margin-top:6px">⚠️ Database save failed: ${esc(e.message)}</div>`; });
        }
      });
    },
  };

  function importCsv(text) {
    const rows = P.parseCsv(text);
    if (!rows.length) return { added: 0, updated: 0 };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name.toLowerCase());
    let added = 0, updated = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const cur = +r[idx("Current Unit Price")] || 0, nw = +r[idx("New Unit Price")] || 0, qty = +r[idx("Annual Quantity")] || 0;
      const id = (r[idx("SKU")] || "SKU-" + String(P.SKUS.length + 1).padStart(3, "0")).trim();
      // Auto-create the brand named in the Shop column (if any) so CSV import
      // works against an empty dataset and links SKUs to brands.
      const brand = P.ensureBrand(r[idx("Shop")] || "", r[idx("Region")] || "");
      const rec = {
        id, productName: r[idx("Product Name")] || id, description: r[idx("Description")] || "",
        category: r[idx("Category")] || "Other", subcategory: r[idx("Subcategory")] || "Miscellaneous",
        currentVendor: r[idx("Current Vendor")] || "Current Local Vendor", recommendedVendor: r[idx("Recommended Vendor")] || "—",
        currentUnitPrice: cur, newUnitPrice: nw, unitOfMeasure: r[idx("UOM")] || "Each", packSize: r[idx("Pack Size")] || "—",
        annualQuantity: qty, currentAnnualSpend: P.round(cur * qty), newAnnualSpend: P.round(nw * qty),
        annualSavings: P.round((cur - nw) * qty), savingsPercentage: cur ? P.round((cur - nw) / cur * 100, 1) : 0,
        shop: brand ? brand.shopName : (r[idx("Shop")] || ""), shopCode: brand ? brand.code : "", region: brand ? brand.region : (r[idx("Region")] || ""),
        qualityTier: r[idx("Quality Tier")] || "Standard", implementationStatus: r[idx("Implementation Status")] || "Not Reviewed",
        preferredItem: /true|yes|1/i.test(r[idx("Preferred Item")] || ""), contractedItem: /true|yes|1/i.test(r[idx("Contracted Item")] || ""),
        imageUrl: "", notes: r[idx("Notes")] || "",
      };
      const existing = P.SKUS.findIndex((s) => s.id === id);
      if (existing >= 0) { P.SKUS[existing] = rec; updated++; } else { P.SKUS.push(rec); added++; }
    }
    return { added, updated };
  }

  /* ============================== AI CATEGORIZER ============================== */
  PAGES.ai = {
    title: "AI Categorization",
    crumb: "AI Categorization",
    render() {
      const examples = ["White bath towel 27x54", "Black trash bag 55 gallon", "Paper towel roll", "Shampoo 1 oz bottle", "Comforter queen white"];
      const exHtml = examples.map((e) => {
        const r = P.categorize(e);
        return `<tr class="row-link" data-ex="${esc(e)}">
          <td class="cell-strong">${esc(e)}</td><td>${esc(r.category)} › ${esc(r.subcategory)}</td>
          <td>${esc(r.productType)}</td><td>${esc(r.qualityTier)}</td><td>${U.confidenceBadge(r.confidence)}</td></tr>`;
      }).join("");
      return `
        <div class="page-head"><h1>AI Categorization</h1><p>Auto-classify uploaded SKUs by product name, description, vendor, UOM, and pack size — assigning category, subcategory, product type, quality tier, and a normalization group with a confidence score.</p></div>
        <div class="notice" style="margin-bottom:18px">ℹ️ This demonstrates the rule-based engine that future AI categorization will replace. Type any product description to see a live classification.</div>
        <div class="grid cols-2">
          <div class="card"><h3 class="card-title">🤖 Try the categorizer</h3>
            <div class="field"><label>Product name / description</label><input type="text" id="aiInput" placeholder="e.g. Luxury sateen sheet set king" value="White bath towel 27x54"></div>
            <button class="btn btn-primary btn-sm" id="aiRun">Categorize</button>
            <div id="aiOut" style="margin-top:16px"></div>
          </div>
          <div class="card"><h3 class="card-title">📚 Example classifications</h3>
            <div class="table-wrap" style="border:none"><table class="data" style="min-width:0"><thead><tr><th>Input</th><th>Category</th><th>Type</th><th>Tier</th><th>Confidence</th></tr></thead><tbody>${exHtml}</tbody></table></div>
          </div>
        </div>
        <div class="card" style="margin-top:16px"><h3 class="card-title">🔎 Signals reviewed</h3>
          <div class="tag-cats">${["Product name", "Product description", "Vendor", "Unit of measure", "Pack size", "Historical category", "Similar SKUs"].map((s) => `<span class="badge navy">${s}</span>`).join("")}</div>
          <h3 class="card-title" style="margin-top:16px">Assignments produced</h3>
          <div class="tag-cats">${["Category", "Subcategory", "Product type", "Quality tier", "Recommended normalization group", "Confidence score"].map((s) => `<span class="badge blue">${s}</span>`).join("")}</div>
        </div>`;
    },
    mount() {
      const run = () => {
        const v = document.getElementById("aiInput").value;
        const r = P.categorize(v);
        document.getElementById("aiOut").innerHTML = `
          <div class="kv-grid">
            <span class="k">Category</span><span class="v">${esc(r.category)}</span>
            <span class="k">Subcategory</span><span class="v">${esc(r.subcategory)}</span>
            <span class="k">Product type</span><span class="v">${esc(r.productType)}</span>
            <span class="k">Quality tier</span><span class="v">${esc(r.qualityTier)}</span>
            <span class="k">Normalization group</span><span class="v">${esc(r.normalizationGroup)}</span>
          </div>
          <div style="margin-top:14px;display:flex;align-items:center;gap:12px">${U.confidenceBadge(r.confidence)} ${U.confidenceMeter(r.score)} <span class="cell-sub">${Math.round(r.score * 100)}%</span></div>`;
      };
      const btn = document.getElementById("aiRun"); if (btn) btn.addEventListener("click", run);
      const input = document.getElementById("aiInput"); if (input) input.addEventListener("keyup", (e) => { if (e.key === "Enter") run(); });
      document.querySelectorAll("tr[data-ex]").forEach((tr) => tr.addEventListener("click", () => { document.getElementById("aiInput").value = tr.getAttribute("data-ex"); run(); }));
      run();
    },
  };

  /* ============================== SECURITY ============================== */
  PAGES.security = {
    title: "Security & Access",
    crumb: "Security & Access",
    render() {
      const m = P.securityMetrics();
      const resultBadge = (r) => {
        const cls = r === "Success" ? "green" : r === "Failed" ? "amber" : r === "Blocked" ? "red" : "gray";
        return `<span class="badge ${cls}">${esc(r)}</span>`;
      };
      const mfaBadge = (txt) => {
        const cls = txt === "Passed" ? "green" : txt === "Failed" ? "red" : txt === "Not enrolled" ? "amber" : "gray";
        return `<span class="badge ${cls}">${esc(txt)}</span>`;
      };

      const roleKeys = Object.keys(m.byRole).sort((a, b) => m.byRole[b] - m.byRole[a]);
      const maxRole = Math.max(...roleKeys.map((k) => m.byRole[k]));
      const roleBars = roleKeys.map((k) => U.hbar(k, m.byRole[k], maxRole, fmt.num(m.byRole[k]))).join("");

      const eventRows = m.events.map((e) => `<tr>
        <td class="cell-sub">${esc(e.time)}</td>
        <td><span class="cell-strong">${esc(e.user)}</span></td>
        <td>${esc(e.role)}</td>
        <td class="mono">${esc(e.ip)}</td>
        <td>${esc(e.location)}</td>
        <td class="cell-sub">${esc(e.device)}</td>
        <td>${mfaBadge(e.mfa)}</td>
        <td>${resultBadge(e.result)}</td>
      </tr>`).join("");

      const userRows = m.users.map((u) => `<tr>
        <td><span class="cell-strong">${esc(u.name)}</span><div class="cell-sub">${esc(u.email)}</div></td>
        <td><span class="badge navy">${esc(u.role)}</span></td>
        <td>${esc(u.shop)}<div class="cell-sub">${esc(u.region)}</div></td>
        <td>${u.mfa ? '<span class="badge green">MFA on</span>' : '<span class="badge amber">No MFA</span>'}</td>
        <td>${u.status === "Active" ? '<span class="badge green"><span class="dot"></span>Active</span>' : '<span class="badge red"><span class="dot"></span>Locked</span>'}</td>
        <td class="cell-sub">${esc(u.lastLogin)}</td>
        <td class="num">${fmt.num(u.logins30d)}</td>
      </tr>`).join("");

      return `
        <div class="page-head"><h1>Security &amp; Access</h1><p>Login activity, multi-factor adoption, and access health across procurement, regional, and shop users.</p></div>

        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">🪪 User Access Management <span class="badge green">live</span></h3>
            <button class="btn btn-outline btn-sm" id="uamReload">↻ Refresh</button>
          </div>
          <p class="cell-sub" style="margin:6px 0 10px">New users create an account on the login screen and appear here as <b>Shop Manager</b>. Assign their role, shop, and region below — changes apply on their next page load.</p>
          <div id="uamBox"><div class="cell-sub">⏳ Loading users…</div></div>
        </div>

        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Logins (30d)", value: fmt.num(m.logins30d), accent: "navy", icon: "🔑", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Active Users", value: m.activeUsers + " / " + m.totalUsers, accent: "blue", icon: "👤", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "MFA Adoption", value: fmt.pct(m.mfaPct), delta: m.mfaGaps + " without MFA", deltaClass: m.mfaGaps ? "text-amber" : "text-green", accent: "green", icon: "🛡️", iconBg: "var(--green-bg)" })}
          ${U.statCard({ label: "Failed / Blocked", value: m.failedAttempts + " / " + m.blockedAttempts, delta: "last 24h", deltaClass: "text-red", accent: "amber", icon: "🚫", iconBg: "var(--amber-bg)" })}
        </div>

        ${m.mfaGaps || m.lockedUsers ? `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber);margin-bottom:18px">⚠️ ${m.mfaGaps} user(s) without MFA and ${m.lockedUsers} locked account(s). Review access before granting catalog edit rights.</div>` : ""}

        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">📊 Logins by Role (30d)</h3>${roleBars}</div>
          <div class="card"><h3 class="card-title">🔐 Access Posture</h3>
            <div class="kv-grid">
              <span class="k">Total users</span><span class="v">${m.totalUsers}</span>
              <span class="k">Active</span><span class="v text-green">${m.activeUsers}</span>
              <span class="k">Locked</span><span class="v text-red">${m.lockedUsers}</span>
              <span class="k">MFA enabled</span><span class="v">${m.mfaOn} of ${m.totalUsers}</span>
              <span class="k">Roles in use</span><span class="v">${Object.keys(P.ROLES).length}</span>
            </div>
            <h3 class="card-title" style="margin-top:16px">Roles</h3>
            <div class="tag-cats">${Object.keys(P.ROLES).map((r) => `<span class="badge navy">${esc(r)}</span>`).join("")}</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <h3 class="card-title">🕑 Recent Login Activity</h3>
          <div class="table-wrap" style="border:none">
            <table class="data" style="min-width:880px"><thead><tr>
              <th>Time</th><th>User</th><th>Role</th><th>IP</th><th>Location</th><th>Device</th><th>MFA</th><th>Result</th>
            </tr></thead><tbody>${eventRows}</tbody></table>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">👥 Users &amp; Access</h3>
          <div class="table-wrap" style="border:none">
            <table class="data" style="min-width:820px"><thead><tr>
              <th>User</th><th>Role</th><th>Shop / Region</th><th>MFA</th><th>Status</th><th>Last Login</th><th class="num">Logins 30d</th>
            </tr></thead><tbody>${userRows}</tbody></table>
          </div>
        </div>`;
    },
    mount() {
      const box = document.getElementById("uamBox");
      if (!box) return;
      const client = window.Auth && window.Auth.client && window.Auth.client();
      if (!client) { box.innerHTML = `<div class="cell-sub">Connect Supabase to manage users.</div>`; return; }
      const isAdmin = State.role === "Procurement Admin";
      const me = window.CURRENT_USER || {};

      const roleOpts = (sel) => Object.keys(P.ROLES).map((r) => `<option value="${esc(r)}" ${r === sel ? "selected" : ""}>${esc(r)}</option>`).join("");
      const shopOpts = (sel) => `<option value="">— Any —</option>` + (P.SHOPS || []).map((s) => `<option value="${esc(s.shopName)}" ${s.shopName === sel ? "selected" : ""}>${esc(s.shopName)}</option>`).join("");
      const regionOpts = (sel) => `<option value="">— Any —</option>` + (P.REGIONS || []).map((r) => `<option value="${esc(r)}" ${r === sel ? "selected" : ""}>${esc(r)}</option>`).join("");

      async function load() {
        box.innerHTML = `<div class="cell-sub">⏳ Loading users…</div>`;
        const [profilesRes, adminsRes] = await Promise.all([
          client.from("profiles").select("*").order("created_at", { ascending: true }),
          client.from("admins").select("*"),
        ]);
        if (profilesRes.error) { box.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(profilesRes.error.message)}</div>`; return; }
        const profiles = profilesRes.data || [];
        const adminEmails = new Set(((adminsRes.data) || []).map((a) => String(a.email || "").toLowerCase()));
        const stBadge = (s) => { const m = { approved: "green", pending: "amber", denied: "red" }; return `<span class="badge ${m[s] || "amber"}">${esc(s || "pending")}</span>`; };
        const statusCell = (p, isMe) => {
          if (!isAdmin) return stBadge(p.status);
          let btns = "";
          if (p.status !== "approved") btns += ` <button class="btn btn-green btn-sm" data-approve-uid="${esc(p.id)}">Approve</button>`;
          if (p.status !== "denied" && !isMe) btns += ` <button class="btn btn-outline btn-sm" data-deny-uid="${esc(p.id)}">Deny</button>`;
          return stBadge(p.status) + btns;
        };
        const pend = profiles.filter((p) => (p.status || "pending") !== "approved");
        const pendPanel = (isAdmin && pend.length) ? `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber);margin-bottom:12px">⏳ <b>${pend.length}</b> access request(s) awaiting review — approve or deny in the table below.</div>` : "";

        const rows = profiles.map((p) => {
          const isMe = p.id === me.id;
          const tag = adminEmails.has(String(p.email || "").toLowerCase()) ? ` <span class="badge purple">portal admin</span>` : "";
          return `<tr data-uid="${esc(p.id)}">
            <td><span class="cell-strong">${esc(p.full_name || "—")}${isMe ? ' <span class="badge blue">you</span>' : ""}</span><div class="cell-sub">${esc(p.email || "")}${tag}</div></td>
            <td>${statusCell(p, isMe)}</td>
            <td>${isAdmin ? `<select class="approve-select" data-f="role">${roleOpts(p.role)}</select>` : `<span class="badge navy">${esc(p.role)}</span>`}</td>
            <td>${isAdmin ? `<select class="approve-select" data-f="shop">${shopOpts(p.shop || "")}</select>` : esc(p.shop || "—")}</td>
            <td>${isAdmin ? `<select class="approve-select" data-f="region">${regionOpts(p.region || "")}</select>` : esc(p.region || "—")}</td>
            <td class="cell-sub">${esc(String(p.created_at || "").slice(0, 10))}</td>
            <td>${isAdmin ? `<button class="btn btn-primary btn-sm" data-save>Save</button>${(p.role !== "Procurement Admin" || p.status !== "approved") ? ` <button class="btn btn-green btn-sm" data-makeadmin="${esc(p.id)}">★ Make admin</button>` : ""}` : ""}<span class="cell-sub" data-msg style="margin-left:8px"></span></td>
          </tr>`;
        }).join("");

        const isOwner = adminEmails.has(String(me.email || "").toLowerCase());
        const inviteForm = isOwner ? `
          <div style="border-top:1px solid var(--gray-200);margin-top:14px;padding-top:14px">
            <h3 class="card-title">✉️ Invite a user <span class="badge purple">owner only</span></h3>
            <p class="cell-sub" style="margin:4px 0 10px">Sends an email invitation and pre-assigns the role — the user just clicks the link and sets a password.</p>
            <div class="grid cols-4" style="gap:10px;margin-bottom:10px">
              <div class="field" style="margin:0"><label>Email</label><input type="email" id="invEmail" placeholder="teammate@company.com"></div>
              <div class="field" style="margin:0"><label>Full name</label><input type="text" id="invName" placeholder="Jane Doe"></div>
              <div class="field" style="margin:0"><label>Role</label><select id="invRole" class="approve-select" style="max-width:none;width:100%">${roleOpts("Shop Manager")}</select></div>
              <div class="field" style="margin:0"><label>Shop</label><select id="invShop" class="approve-select" style="max-width:none;width:100%">${shopOpts("")}</select></div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" id="invSend">Send invitation</button>
              <span class="cell-sub" id="invMsg"></span>
            </div>
          </div>` : "";

        box.innerHTML = `
          ${pendPanel}
          ${profiles.length ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:820px"><thead><tr>
            <th>User</th><th>Access</th><th>Role</th><th>Shop</th><th>Region</th><th>Joined</th><th></th>
          </tr></thead><tbody>${rows}</tbody></table></div>`
          : `<div class="cell-sub">No users yet. Use the invitation form below or share the portal URL — sign-ups will appear here.</div>`}
          ${isAdmin ? "" : `<div class="notice" style="margin-top:10px">🔒 Only a Procurement Admin can change roles.</div>`}
          ${inviteForm}`;

        // Approve / deny access requests.
        box.querySelectorAll("[data-approve-uid]").forEach((b) => b.addEventListener("click", async () => {
          b.disabled = true;
          const { error } = await client.from("profiles").update({ status: "approved" }).eq("id", b.getAttribute("data-approve-uid"));
          if (error) { alert(error.message); b.disabled = false; return; }
          load();
        }));
        box.querySelectorAll("[data-deny-uid]").forEach((b) => b.addEventListener("click", async () => {
          if (!confirm("Deny access for this user?")) return;
          b.disabled = true;
          const { error } = await client.from("profiles").update({ status: "denied" }).eq("id", b.getAttribute("data-deny-uid"));
          if (error) { alert(error.message); b.disabled = false; return; }
          load();
        }));
        box.querySelectorAll("[data-makeadmin]").forEach((b) => b.addEventListener("click", async () => {
          b.disabled = true;
          const { error } = await client.from("profiles").update({ role: "Procurement Admin", status: "approved" }).eq("id", b.getAttribute("data-makeadmin"));
          if (error) { alert(error.message); b.disabled = false; return; }
          load();
        }));

        const sendBtn = document.getElementById("invSend");
        if (sendBtn) sendBtn.addEventListener("click", async () => {
          const msg = document.getElementById("invMsg");
          const email = (document.getElementById("invEmail").value || "").trim();
          if (!email) { msg.textContent = "Enter an email address."; return; }
          sendBtn.disabled = true; msg.textContent = "Sending invitation…";
          try {
            const { data, error } = await client.functions.invoke("admin-invite", {
              body: {
                email,
                fullName: (document.getElementById("invName").value || "").trim(),
                role: document.getElementById("invRole").value,
                shop: document.getElementById("invShop").value,
                region: "",
                redirectTo: location.origin + location.pathname,
              },
            });
            if (error) {
              let m = error.message || "Invite failed.";
              try { const b = await error.context.json(); if (b && b.error) m = b.error; } catch (_) { /* ignore */ }
              throw new Error(m);
            }
            if (data && data.error) throw new Error(data.error);
            msg.textContent = `✅ Invitation sent to ${email} as ${data.role}.`;
            document.getElementById("invEmail").value = ""; document.getElementById("invName").value = "";
            setTimeout(load, 1200);
          } catch (e) {
            msg.textContent = "⚠️ " + (e.message || e);
          } finally {
            sendBtn.disabled = false;
          }
        });

        if (!isAdmin) return;
        box.querySelectorAll("tr[data-uid]").forEach((tr) => {
          const btn = tr.querySelector("[data-save]");
          if (!btn) return;
          btn.addEventListener("click", async () => {
            const msg = tr.querySelector("[data-msg]");
            const get = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : null; };
            btn.disabled = true; msg.textContent = "Saving…";
            const { error } = await client.from("profiles")
              .update({ role: get("role"), shop: get("shop"), region: get("region") })
              .eq("id", tr.getAttribute("data-uid"));
            btn.disabled = false;
            msg.textContent = error ? "⚠️ " + error.message : "✅ Saved";
            if (!error && tr.getAttribute("data-uid") === me.id) msg.textContent += " — reload to apply to yourself";
          });
        });
      }

      const reload = document.getElementById("uamReload");
      if (reload) reload.addEventListener("click", load);
      load();
    },
  };

  /* ===================== ASK AI (KAI – Knowledge Assistant) ===================== */
  const ASK_SUGGESTIONS = [
    "Summarize my total savings opportunity for an executive.",
    "Which 5 SKUs have the biggest annual savings?",
    "Which shop has the most untapped savings, and why?",
    "Where am I paying more than the recommended/contracted price?",
    "Which categories should I prioritize first for quick wins?",
    "Which vendors should I consolidate spend with?",
  ];
  const renderAnswer = (text) => `<div class="ai-answer">${esc(text).replace(/\n/g, "<br>")}</div>`;

  PAGES.ask = {
    title: "Ask AI",
    crumb: "Ask AI",
    render() {
      if (!(P.SKUS || []).length) return `<div class="page-head"><h1>Ask AI</h1><p>Chat with your live procurement catalog.</p></div>${emptyState("Load brands and products first, then ask anything about your spend.")}`;
      const chips = ASK_SUGGESTIONS.map((q) => `<button class="badge blue ask-chip" data-q="${esc(q)}" style="cursor:pointer;border:none">${esc(q)}</button>`).join(" ");
      return `
        <div class="page-head"><h1>🤖 Ask AI <span class="badge navy" style="vertical-align:middle">Knowledge Assistant</span></h1>
          <p>Ask anything about your catalog, vendors, shops, spend and savings in plain English. Answers are grounded in your live data (${fmt.num((P.SKUS || []).length)} SKUs).</p></div>
        <div class="card">
          <div class="field"><label>Your question</label>
            <textarea id="askInput" rows="3" placeholder="e.g. Which shops overpay for bath towels, and how much could I save by standardizing?"></textarea></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="askRun">Ask</button>
            <span class="cell-sub">Powered by your configured AI provider · grounded in portal data</span>
          </div>
          <div style="margin-top:12px"><div class="cell-sub" style="margin-bottom:6px">Try one of these:</div><div class="tag-cats">${chips}</div></div>
          <div id="askOut" style="margin-top:16px"></div>
        </div>`;
    },
    mount() {
      const input = document.getElementById("askInput");
      const out = document.getElementById("askOut");
      if (!input || !out) return;
      const run = async () => {
        const q = (input.value || "").trim();
        if (!q) { input.focus(); return; }
        out.innerHTML = `<div class="notice">⏳ Thinking — reading your catalog…</div>`;
        try {
          const text = await window.AI.ask(q, window.AI.snapshot());
          out.innerHTML = renderAnswer(text || "No answer was returned.");
        } catch (e) {
          out.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(e.message || String(e))}</div>`;
        }
      };
      document.getElementById("askRun").addEventListener("click", run);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); });
      document.querySelectorAll(".ask-chip").forEach((b) => b.addEventListener("click", () => { input.value = b.getAttribute("data-q"); run(); }));
    },
  };

  /* ============== RISK & INTELLIGENCE (RAI + SPAI) ============== */
  function intelMetrics() {
    const skus = (P.scopedSkus ? P.scopedSkus() : P.SKUS) || [];
    const totals = P.aggregate(skus);
    const share = (rows) => {
      const m = {};
      rows.forEach((s) => { const k = s.shop || "—"; m[k] = (m[k] || 0) + s.currentAnnualSpend; });
      return m;
    };
    const byShop = Object.entries(share(skus)).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend);
    const catMap = {};
    skus.forEach((s) => { const k = s.categoryGroup || "Other"; catMap[k] = (catMap[k] || 0) + s.currentAnnualSpend; });
    const byCat = Object.entries(catMap).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend);
    const totalSpend = totals.baselineSpend || 1;
    const topN = (arr, n) => arr.slice(0, n).reduce((a, x) => a + x.spend, 0);
    const dq = P.dataQuality();
    const atRisk = skus.filter((s) => s.annualSavings > 0 && (!s.implementationStatus || s.implementationStatus === "Not Reviewed"));
    const atRiskSavings = Math.round(atRisk.reduce((a, s) => a + s.annualSavings, 0));
    const negImpact = Math.round(dq.negative.reduce((a, s) => a + (s.newUnitPrice - s.currentUnitPrice) * (s.annualQuantity || 0), 0));
    return {
      totals, byShop, byCat, totalSpend, dq, atRisk, atRiskSavings, negImpact,
      top3ShopShare: topN(byShop, 3) / totalSpend * 100,
      top3CatShare: topN(byCat, 3) / totalSpend * 100,
    };
  }

  PAGES.intel = {
    title: "Risk & Intelligence",
    crumb: "Risk & Intelligence",
    render() {
      if (!(P.SKUS || []).length) return `<div class="page-head"><h1>Risk &amp; Intelligence</h1></div>${emptyState()}`;
      const m = intelMetrics();
      const riskOf = (pct) => pct >= 60 ? "High" : pct >= 35 ? "Medium" : "Low";
      const maxShop = mx(m.byShop.map((x) => x.spend));
      const maxCat = mx(m.byCat.map((x) => x.spend));
      const shopBars = m.byShop.slice(0, 8).map((x) => U.hbar(x.name, x.spend, maxShop, fmt.moneyShort(x.spend) + ` · ${(x.spend / m.totalSpend * 100).toFixed(0)}%`)).join("");
      const catBars = m.byCat.slice(0, 8).map((x) => U.hbar(x.name, x.spend, maxCat, fmt.moneyShort(x.spend) + ` · ${(x.spend / m.totalSpend * 100).toFixed(0)}%`)).join("");
      const negRows = m.dq.negative.slice(0, 10).map((s) => `<tr>
        <td class="cell-strong">${esc(s.productName)}</td><td>${esc(s.shop)}</td>
        <td class="num">${fmt.money(s.currentUnitPrice, 2)}</td><td class="num text-red">${fmt.money(s.newUnitPrice, 2)}</td>
        <td class="num text-red">${fmt.money((s.newUnitPrice - s.currentUnitPrice) * (s.annualQuantity || 0))}</td></tr>`).join("");
      const outRows = m.dq.outliers.slice(0, 10).map((o) => `<tr>
        <td class="cell-strong">${esc(o.sku.productName)}</td><td>${esc(o.sku.shop)}</td>
        <td class="num">${fmt.money(o.sku.currentUnitPrice, 2)}</td><td class="num">${fmt.money(o.median, 2)}</td>
        <td class="num text-amber">${(o.sku.currentUnitPrice / o.median).toFixed(1)}×</td></tr>`).join("");
      return `
        <div class="page-head"><h1>📉 Risk &amp; Intelligence <span class="badge navy" style="vertical-align:middle">SPAI · RAI</span></h1>
          <p>Spend concentration, savings at risk, and pricing anomalies across ${fmt.num(m.totals.skuCount)} SKUs and ${fmt.num(m.byShop.length)} shops.</p></div>
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Total spend analyzed", value: fmt.moneyShort(m.totals.baselineSpend), accent: "navy", icon: "💰" })}
          ${U.statCard({ label: "Savings at risk (unreviewed)", value: fmt.moneyShort(m.atRiskSavings), delta: m.atRisk.length + " SKUs not reviewed", deltaClass: "text-amber", accent: "amber", icon: "⏳" })}
          ${U.statCard({ label: "Negative-savings exposure", value: fmt.moneyShort(m.negImpact), delta: m.dq.counts.negative + " rows cost more", deltaClass: m.dq.counts.negative ? "text-red" : "text-green", accent: "red", icon: "⚠️" })}
          ${U.statCard({ label: "Top-3 shop concentration", value: m.top3ShopShare.toFixed(0) + "%", delta: riskOf(m.top3ShopShare) + " concentration", deltaClass: "text-muted", accent: "blue", icon: "🏬" })}
        </div>
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">🏬 Spend concentration by shop ${U.riskBadge(riskOf(m.top3ShopShare))}</h3>${shopBars}</div>
          <div class="card"><h3 class="card-title">🗂️ Spend concentration by category ${U.riskBadge(riskOf(m.top3CatShare))}</h3>${catBars}</div>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">🧠 AI risk &amp; spend briefing</h3>
            <button class="btn btn-primary btn-sm" id="intelBrief">Generate briefing</button>
          </div>
          <div id="intelOut" style="margin-top:12px"><div class="cell-sub">Click “Generate briefing” for an executive-ready narrative of your concentration risk, savings at risk, and recommended next move.</div></div>
        </div>
        ${m.dq.counts.negative ? `<div class="card" style="margin-bottom:16px"><h3 class="card-title">⚠️ Rows where the new price is higher (negative savings)</h3>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:680px"><thead><tr><th>Product</th><th>Shop</th><th class="num">Current</th><th class="num">New</th><th class="num">Annual impact</th></tr></thead><tbody>${negRows}</tbody></table></div></div>` : ""}
        ${m.dq.counts.outliers ? `<div class="card"><h3 class="card-title">📈 Price outliers (vs. subcategory median)</h3>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:620px"><thead><tr><th>Product</th><th>Shop</th><th class="num">Price</th><th class="num">Median</th><th class="num">Ratio</th></tr></thead><tbody>${outRows}</tbody></table></div></div>` : ""}`;
    },
    mount() {
      const btn = document.getElementById("intelBrief");
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const out = document.getElementById("intelOut");
        out.innerHTML = `<div class="notice">⏳ Analyzing concentration, risk and savings…</div>`;
        const q = "Act as a procurement risk & spend analyst. Using the portal data, write an executive briefing (about 160 words) covering: (1) where spend is most concentrated by shop and category and whether that is a risk, (2) the dollar value of savings sitting unreviewed, (3) any rows where the negotiated price is higher than current, and (4) ONE concrete recommended next action this week.";
        try {
          const text = await window.AI.ask(q, window.AI.snapshot());
          out.innerHTML = renderAnswer(text || "No briefing returned.");
        } catch (e) {
          out.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(e.message || String(e))}</div>`;
        }
      });
    },
  };

  /* ============== DATA QUALITY & AUDIT (DAI) ============== */
  function qualityMetrics() {
    const skus = P.SKUS || [];
    const dq = P.dataQuality();
    // Cross-shop price inconsistency: same vendor SKU code bought by 2+ shops
    // at different prices — a consolidation/standardization opportunity.
    const byCode = {};
    skus.forEach((s) => { if (s.sku) (byCode[s.sku] = byCode[s.sku] || []).push(s); });
    const inconsistent = [];
    Object.keys(byCode).forEach((code) => {
      const rows = byCode[code];
      const shops = new Set(rows.map((r) => r.shop));
      const prices = rows.map((r) => r.currentUnitPrice).filter((p) => p > 0);
      if (shops.size < 2 || prices.length < 2) return;
      const min = Math.min(...prices), max = Math.max(...prices);
      if (max - min < 0.01) return;
      const potential = Math.round(rows.reduce((a, r) => a + Math.max(0, (r.currentUnitPrice - min)) * (r.annualQuantity || 0), 0));
      inconsistent.push({ code, name: rows[0].productName, shops: shops.size, min, max, spread: max - min, potential });
    });
    inconsistent.sort((a, b) => b.potential - a.potential);
    // True duplicates: same shop + same code (or name) appearing more than once.
    const dupTally = {};
    skus.forEach((s) => { const k = (s.shop || "") + "∥" + (s.sku || s.productName || ""); dupTally[k] = (dupTally[k] || 0) + 1; });
    const duplicates = Object.keys(dupTally).filter((k) => dupTally[k] > 1).length;
    const missingCat = skus.filter((s) => !s.category || s.category === "Other").length;
    const consolidationTotal = Math.round(inconsistent.reduce((a, x) => a + x.potential, 0));
    return { dq, inconsistent, duplicates, missingCat, consolidationTotal, total: skus.length };
  }

  PAGES.quality = {
    title: "Data Quality",
    crumb: "Data Quality",
    render() {
      if (!(P.SKUS || []).length && !(P.CONTRACTS || []).length) return `<div class="page-head"><h1>Data Quality &amp; Audit</h1></div>${emptyState()}`;
      const m = qualityMetrics();
      const c = m.dq.counts;
      const vdups = P.vendorDuplicates();
      const issues = c.negative + c.missingPrice + c.missingQty + c.outliers + m.duplicates + m.missingCat + m.inconsistent.length + vdups.length;
      const incRows = m.inconsistent.slice(0, 15).map((x) => `<tr>
        <td class="cell-strong">${esc(x.name)}</td><td class="mono">${esc(x.code)}</td><td class="num">${x.shops}</td>
        <td class="num">${fmt.money(x.min, 2)}</td><td class="num">${fmt.money(x.max, 2)}</td>
        <td class="num text-green">${fmt.money(x.potential)}</td></tr>`).join("");
      const vdupRows = vdups.slice(0, 15).map((d) => `<tr>
        <td><span class="badge ${d.kind === "Same SKU" ? "red" : "amber"}">${esc(d.kind)}</span></td>
        <td class="cell-strong">${esc(d.name)}${d.sku ? ` <span class="mono cell-sub">${esc(d.sku)}</span>` : ""}</td>
        <td>${esc(d.vendor)}</td><td class="num">${d.count}×</td>
        <td class="num">${d.spread > 0 ? `<span class="text-red">${fmt.money(d.min, 2)}–${fmt.money(d.max, 2)}</span>` : fmt.money(d.min, 2)}</td>
        <td>${esc(Array.from(new Set(d.items.map((i) => i.source))).join(", "))}</td></tr>`).join("");
      return `
        <div class="page-head"><h1>🧹 Data Quality &amp; Audit <span class="badge navy" style="vertical-align:middle">DAI</span></h1>
          <p>Trustworthy data for accurate reporting. Scanned ${fmt.num(m.total)} SKUs for duplicates, gaps, outliers, and cross-shop price inconsistencies.</p></div>
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Total issues found", value: fmt.num(issues), accent: "amber", icon: "🔎" })}
          ${U.statCard({ label: "Consolidation upside", value: fmt.moneyShort(m.consolidationTotal), delta: m.inconsistent.length + " SKUs priced differently across shops", deltaClass: "text-green", accent: "green", icon: "🔗" })}
          ${U.statCard({ label: "Missing price / qty", value: fmt.num(c.missingPrice) + " / " + fmt.num(c.missingQty), accent: "blue", icon: "❓" })}
          ${U.statCard({ label: "Duplicates / outliers", value: fmt.num(m.duplicates) + " / " + fmt.num(c.outliers), accent: "navy", icon: "📑" })}
        </div>
        <div class="card" style="margin-bottom:16px">
          <h3 class="card-title">🔗 Same SKU, different price across shops — standardization opportunity</h3>
          <p class="cell-sub" style="margin-top:-4px">If every shop matched the lowest price already paid for the same item, the annualized upside is <b class="text-green">${fmt.money(m.consolidationTotal)}</b>.</p>
          ${m.inconsistent.length ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:680px"><thead><tr><th>Product</th><th>SKU</th><th class="num">Shops</th><th class="num">Min</th><th class="num">Max</th><th class="num">Upside</th></tr></thead><tbody>${incRows}</tbody></table></div>` : `<div class="cell-sub">No cross-shop price gaps detected.</div>`}
        </div>
        <div class="card" style="margin-bottom:16px;border-left:3px solid var(--red)">
          <h3 class="card-title">🚩 Same vendor — duplicate SKU / product (review)</h3>
          <p class="cell-sub" style="margin-top:-4px">The same item appears more than once from one vendor across the catalog and uploaded contracts/invoices — often at different prices. Review to dedupe or reconcile.</p>
          ${vdups.length ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:720px"><thead><tr><th>Flag</th><th>Product</th><th>Vendor</th><th class="num">Seen</th><th class="num">Price range</th><th>Where</th></tr></thead><tbody>${vdupRows}</tbody></table></div>${vdups.length > 15 ? `<div class="cell-sub" style="margin-top:8px">+ ${vdups.length - 15} more…</div>` : ""}` : `<div class="cell-sub">✅ No same-vendor duplicates found.</div>`}
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">🧠 AI cleanup summary</h3>
            <button class="btn btn-primary btn-sm" id="qualBrief">Summarize findings</button>
          </div>
          <div id="qualOut" style="margin-top:12px"><div class="cell-sub">Generate a plain-English summary of the data issues and a prioritized cleanup plan.</div></div>
        </div>`;
    },
    mount() {
      const btn = document.getElementById("qualBrief");
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const m = qualityMetrics();
        const out = document.getElementById("qualOut");
        out.innerHTML = `<div class="notice">⏳ Reviewing data quality…</div>`;
        const ctx = {
          totalSkus: m.total,
          counts: { ...m.dq.counts, duplicates: m.duplicates, missingCategory: m.missingCat, crossShopPriceGaps: m.inconsistent.length },
          consolidationUpside: m.consolidationTotal,
          topPriceInconsistencies: m.inconsistent.slice(0, 15),
          sampleNegative: m.dq.negative.slice(0, 8).map((s) => ({ name: s.productName, shop: s.shop, cur: s.currentUnitPrice, new: s.newUnitPrice })),
        };
        const q = "Act as a procurement data-quality analyst. Summarize the data issues in this audit in about 140 words, then give a prioritized 3-step cleanup plan. Call out the dollar consolidation upside from standardizing the same SKU's price across shops.";
        try {
          const text = await window.AI.ask(q, ctx);
          out.innerHTML = renderAnswer(text || "No summary returned.");
        } catch (e) {
          out.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(e.message || String(e))}</div>`;
        }
      });
    },
  };

  /* ============== BUYING PATTERNS (AP spend seasonality) ============== */
  const AP_HELP = `<div class="notice" style="margin-top:14px">🤖 <b>Upload spend data in any format</b> — Excel, CSV, a PDF statement, or a photo of an invoice. Claude reads the file, figures out the columns, normalizes dates and amounts, and classifies each line into a category for you. No fixed template needed (though tidy columns like Date / Shop / Category / Amount help).</div>`;

  function apUploadControls(canEdit, hasData) {
    if (!canEdit) return hasData ? "" : `<div class="cell-sub" style="margin-top:10px">Ask a Procurement Admin to upload AP spend data.</div>`;
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px">
        <input type="file" id="apFile" accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.txt,.tsv" style="display:none">
        <button class="btn btn-primary btn-sm" id="apUploadBtn">🤖 Smart upload spend</button>
        <button class="btn btn-outline btn-sm" id="apTemplate">⬇ CSV template</button>
        ${hasData ? `<button class="btn btn-outline btn-sm" id="apClear">🗑 Clear AP data</button>` : ""}
        <span class="cell-sub" id="apMsg"></span>
      </div>`;
  }

  PAGES.patterns = {
    title: "Buying Patterns",
    crumb: "Buying Patterns",
    render() {
      const canEdit = State.role === "Procurement Admin";
      const hasData = (P.AP || []).length > 0;
      const head = `<div class="page-head"><h1>📅 Buying Patterns <span class="badge navy" style="vertical-align:middle">Seasonality</span></h1>
        <p>See <b>when</b> each category is purchased across the year — upload AP spend to reveal demand timing per shop.</p></div>`;
      if (!hasData) {
        return `${head}<div class="card"><h3 class="card-title">Upload accounts-payable spend</h3>
          <p class="text-muted" style="max-width:560px">Once you upload dated purchase lines, this page shows a month-by-month heatmap of buying activity per category and the peak buying month for linens, disposables, supplies, and more.</p>
          ${apUploadControls(canEdit, false)}${AP_HELP}</div>`;
      }

      const shops = P.apShops();
      const sel = State.patternsShop && (shops.includes(State.patternsShop) || State.patternsShop === "All") ? State.patternsShop : "All";
      const m = P.apSummary(sel);
      const shopOptions = [`<option value="All" ${sel === "All" ? "selected" : ""}>All shops</option>`]
        .concat(shops.map((s) => `<option value="${esc(s)}" ${s === sel ? "selected" : ""}>${esc(s)}</option>`)).join("");

      // Heatmap colour scale across category × month.
      const maxCell = mx(m.categories.flatMap((c) => c.byCalMonth)) || 1;
      const cell = (v, isPeak) => {
        const a = v > 0 ? 0.12 + 0.83 * (v / maxCell) : 0;
        const txt = v > 0 ? (a > 0.55 ? "#fff" : "var(--ink,#1f2937)") : "var(--gray-400,#9aa6b2)";
        return `<td style="text-align:center;padding:6px 4px;background:rgba(30,58,95,${a.toFixed(3)});color:${txt};${isPeak ? "outline:2px solid var(--amber,#d97706);outline-offset:-2px;font-weight:700" : ""}" title="${v > 0 ? fmt.money(v) : "—"}">${v > 0 ? fmt.moneyShort(v) : "·"}</td>`;
      };
      const monthHead = `<th></th>${P.MONTHS.map((mo, i) => `<th class="num" style="text-align:center;${i === m.peakMonth ? "color:var(--amber,#d97706)" : ""}">${mo}</th>`).join("")}`;
      const heatRows = m.categories.map((c) => `<tr>
        <td class="cell-strong" style="white-space:nowrap">${esc(c.group)} <span class="cell-sub">${fmt.moneyShort(c.total)}</span></td>
        ${c.byCalMonth.map((v, i) => cell(v, i === c.peakMonth && v > 0)).join("")}
      </tr>`).join("");

      const peakList = m.categories.map((c) => `<div class="bar-row">
        <div class="bl">${esc(c.group)}</div>
        <div class="hbar"><span style="width:${Math.max(3, (c.total / (m.categories[0].total || 1)) * 100)}%"></span></div>
        <div class="bv">${c.peakMonth >= 0 ? `<b>${P.MONTHS[c.peakMonth]}</b> · ${fmt.moneyShort(c.peakValue)}` : "—"}</div>
      </div>`).join("");

      const range = m.minDate && m.maxDate ? `${m.minDate} → ${m.maxDate}` : "—";
      return `${head}
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div class="field" style="margin:0;min-width:220px"><label>Shop</label>
              <select id="apShopSel" class="approve-select" style="max-width:none;width:100%">${shopOptions}</select></div>
            <div class="cell-sub">${fmt.num(m.rows)} purchase lines · ${esc(range)}</div>
          </div>
          ${apUploadControls(canEdit, true)}
        </div>
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "AP spend analyzed", value: fmt.moneyShort(m.total), accent: "navy", icon: "💵" })}
          ${U.statCard({ label: "Peak buying month", value: m.peakMonth >= 0 ? P.MONTHS[m.peakMonth] : "—", delta: m.peakMonth >= 0 ? fmt.moneyShort(m.byCalMonth[m.peakMonth]) + " that month" : "", deltaClass: "text-muted", accent: "amber", icon: "📈" })}
          ${U.statCard({ label: "Busiest category", value: m.categories[0] ? m.categories[0].group : "—", delta: m.categories[0] ? fmt.moneyShort(m.categories[0].total) : "", deltaClass: "text-muted", accent: "blue", icon: "🗂️" })}
          ${U.statCard({ label: "Shops covered", value: fmt.num(shops.length), accent: "green", icon: "🏬" })}
        </div>
        <div class="card" style="margin-bottom:16px">
          <h3 class="card-title">🔥 When is each category bought? <span class="cell-sub">(spend by calendar month — darker = more)</span></h3>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:760px"><thead><tr>${monthHead}</tr></thead><tbody>${heatRows}</tbody></table></div>
        </div>
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">🏆 Peak buying month by category</h3>${peakList}</div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <h3 class="card-title" style="margin:0">🧠 AI buying-pattern insight</h3>
              <button class="btn btn-primary btn-sm" id="apBrief">Analyze timing</button>
            </div>
            <div id="apOut" style="margin-top:12px"><div class="cell-sub">Get advice on when to stock up, negotiate, or consolidate orders based on the seasonality above.</div></div>
          </div>
        </div>`;
    },
    mount() {
      const rerender = () => window.App.renderCurrent();
      const sel = document.getElementById("apShopSel");
      if (sel) sel.addEventListener("change", () => { State.patternsShop = sel.value; rerender(); });

      const tpl = document.getElementById("apTemplate");
      if (tpl) tpl.addEventListener("click", () => {
        const sample = "Date,Shop,Category,Subcategory,Vendor,Amount,Quantity,Description\n2026-03-12,Avada Properties,Linens,Bath Towels,Calderon Textiles,1840.50,600,Bath towels 27x54\n2026-07-08,Avada Properties,Disposables,Toiletries,A1 American,920.00,1200,Shampoo 1oz";
        const blob = new Blob([sample], { type: "text/csv" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ap_spend_template.csv"; a.click();
      });

      const btn = document.getElementById("apUploadBtn");
      const file = document.getElementById("apFile");
      const msg = document.getElementById("apMsg");

      if (btn && file) {
        btn.addEventListener("click", () => file.click());
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          msg.textContent = "🤖 Reading " + f.name + " (all tabs)…";
          try {
            const { added } = await ingestSpendFile(f, {});
            if (!added) { msg.textContent = "⚠️ No dated spend lines were found in that file."; return; }
            msg.textContent = `Saving ${added} lines…`;
            if (window.Store && window.Store.available()) await window.Store.pushAp();
            window.App.renderCurrent();
          } catch (e) {
            msg.textContent = "⚠️ " + (e.message || e);
          } finally {
            file.value = "";
          }
        });
      }

      const clr = document.getElementById("apClear");
      if (clr) clr.addEventListener("click", async () => {
        if (!confirm("Remove ALL AP spend data (including from the database)?")) return;
        P.apClear();
        try { if (window.Store && window.Store.available()) await window.Store.pushAp(); } catch (_) { /* ignore */ }
        window.App.renderCurrent();
      });

      const brief = document.getElementById("apBrief");
      if (brief) brief.addEventListener("click", async () => {
        const m = P.apSummary(State.patternsShop || "All");
        const out = document.getElementById("apOut");
        out.innerHTML = `<div class="notice">⏳ Analyzing buying patterns…</div>`;
        const ctx = {
          shop: State.patternsShop || "All shops", months: P.MONTHS,
          totalSpend: m.total, peakMonthIndex: m.peakMonth, spendByCalendarMonth: m.byCalMonth,
          categories: m.categories.map((c) => ({ category: c.group, total: c.total, peakMonth: c.peakMonth >= 0 ? P.MONTHS[c.peakMonth] : null, byCalendarMonth: c.byCalMonth })),
        };
        const q = "Using this accounts-payable seasonality data, tell the shop WHEN they buy each category most and give 3 concrete, dated recommendations: when to stock up ahead of peaks, when to negotiate annual contracts, and where order consolidation could cut cost. About 150 words.";
        try {
          out.innerHTML = `<div class="ai-answer">${esc(await window.AI.ask(q, ctx) || "No insight returned.").replace(/\n/g, "<br>")}</div>`;
        } catch (e) {
          out.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(e.message || String(e))}</div>`;
        }
      });
    },
  };

  /* ============== UoM CONVERTER (apples-to-apples) ============== */
  PAGES.uom = {
    title: "UoM Converter",
    crumb: "UoM Converter",
    render() {
      const dims = window.UOM.dimensions();
      const dimOpts = dims.map((d) => `<option value="${d.key}">${esc(d.label)}</option>`).join("");
      const basis = window.UOM.CATEGORY_BASIS;
      const basisChips = Object.keys(basis).map((c) => `<div class="uom-basis"><b>${esc(c)}</b><span>${esc(basis[c].note)}</span></div>`).join("");
      return `
        <div class="page-head"><h1>📐 UoM Converter</h1><p>Normalize any unit, pack, or case to a common base so you can benchmark and compare items <b>apples-to-apples</b> across linens, disposables, technology, and more.</p></div>

        <div class="grid cols-2">
          <div class="card">
            <h3 class="card-title">🔁 Unit converter</h3>
            <div class="grid cols-2" style="gap:10px;align-items:end;grid-template-columns:1fr 1fr">
              <div class="field" style="margin:0"><label>Dimension</label><select id="uomDim">${dimOpts}</select></div>
              <div class="field" style="margin:0"><label>Value</label><input id="uomVal" type="number" value="1" step="any"></div>
              <div class="field" style="margin:0"><label>From</label><select id="uomFrom"></select></div>
              <div class="field" style="margin:0"><label>To</label><select id="uomTo"></select></div>
            </div>
            <div id="uomResult" class="uom-result">—</div>
          </div>

          <div class="card">
            <h3 class="card-title">🧮 Price per each</h3>
            <p class="cell-sub" style="margin-top:-6px">Turn a case/pack price into a per-unit price. Pack accepts text like “case of 12”, “30 ct”, “dozen”, “(48)”.</p>
            <div class="grid cols-2" style="gap:10px;align-items:end;grid-template-columns:1fr 1fr">
              <div class="field" style="margin:0"><label>Pack price ($)</label><input id="ppPrice" type="number" step="any" placeholder="0.00"></div>
              <div class="field" style="margin:0"><label>Pack / UoM</label><input id="ppPack" type="text" placeholder="case of 12"></div>
            </div>
            <div id="ppOut" class="uom-result">—</div>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <h3 class="card-title">⚖️ Apples-to-apples compare</h3>
          <p class="cell-sub" style="margin-top:-6px">Enter two quotes in any pack size — the tool reduces both to price-per-each and names the better deal.</p>
          <div class="cmp-grid">
            <div class="cmp-col">
              <div class="cmp-h">Option A</div>
              <div class="field"><label>Label</label><input id="aName" type="text" placeholder="Vendor A — bath towel"></div>
              <div class="field"><label>Pack price ($)</label><input id="aPrice" type="number" step="any" placeholder="0.00"></div>
              <div class="field" style="margin:0"><label>Pack / UoM</label><input id="aPack" type="text" placeholder="case of 24"></div>
            </div>
            <div class="cmp-col">
              <div class="cmp-h">Option B</div>
              <div class="field"><label>Label</label><input id="bName" type="text" placeholder="Vendor B — bath towel"></div>
              <div class="field"><label>Pack price ($)</label><input id="bPrice" type="number" step="any" placeholder="0.00"></div>
              <div class="field" style="margin:0"><label>Pack / UoM</label><input id="bPack" type="text" placeholder="dozen"></div>
            </div>
          </div>
          <div id="cmpOut" class="uom-result" style="margin-top:14px">—</div>
        </div>

        <div class="card" style="margin-top:16px">
          <h3 class="card-title">🗂️ Recommended comparison basis by category</h3>
          <div class="uom-basis-grid">${basisChips}</div>
        </div>`;
    },
    mount() {
      const U = window.UOM;
      const $ = (id) => document.getElementById(id);
      const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

      function fillUnits() {
        const dim = $("uomDim").value;
        const units = U.unitsForDimension(dim);
        const opts = units.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
        $("uomFrom").innerHTML = opts; $("uomTo").innerHTML = opts;
        if (units[1]) $("uomTo").value = units[1];
        convertNow();
      }
      function convertNow() {
        const r = U.convert($("uomVal").value, $("uomFrom").value, $("uomTo").value);
        $("uomResult").innerHTML = r == null ? "—"
          : `<b>${(+$("uomVal").value || 0).toLocaleString()}</b> ${esc($("uomFrom").value)} = <b class="uom-big">${(+r.toFixed(6)).toLocaleString()}</b> ${esc($("uomTo").value)}`;
      }
      function priceNow() {
        const p = +$("ppPrice").value, pack = $("ppPack").value;
        if (!isFinite(p) || !p) { $("ppOut").innerHTML = "—"; return; }
        const qty = U.parsePackQty(pack);
        $("ppOut").innerHTML = `<b class="uom-big">${money(p / qty)}</b> / each <span class="cell-sub">(÷ ${qty} per ${esc(pack || "pack")})</span>`;
      }
      function compareNow() {
        const a = { name: $("aName").value || "Option A", p: +$("aPrice").value, qty: U.parsePackQty($("aPack").value) };
        const b = { name: $("bName").value || "Option B", p: +$("bPrice").value, qty: U.parsePackQty($("bPack").value) };
        if (!a.p || !b.p) { $("cmpOut").innerHTML = "Enter both pack prices to compare."; return; }
        a.each = a.p / a.qty; b.each = b.p / b.qty;
        const win = a.each <= b.each ? a : b, lose = win === a ? b : a;
        const pct = lose.each ? ((lose.each - win.each) / lose.each * 100) : 0;
        $("cmpOut").innerHTML = `
          <div class="cmp-res">
            <div class="cmp-cell ${win === a ? "win" : ""}"><span>${esc(a.name)}</span><b>${money(a.each)}/ea</b><div class="cell-sub">${money(a.p)} ÷ ${a.qty}</div></div>
            <div class="cmp-cell ${win === b ? "win" : ""}"><span>${esc(b.name)}</span><b>${money(b.each)}/ea</b><div class="cell-sub">${money(b.p)} ÷ ${b.qty}</div></div>
          </div>
          <div class="cmp-verdict">✅ <b>${esc(win.name)}</b> is cheaper by <b>${money(lose.each - win.each)}/each</b> (${pct.toFixed(1)}%)</div>`;
      }
      $("uomDim").addEventListener("change", fillUnits);
      ["uomVal", "uomFrom", "uomTo"].forEach((id) => $(id).addEventListener("input", convertNow));
      ["ppPrice", "ppPack"].forEach((id) => $(id).addEventListener("input", priceNow));
      ["aName", "aPrice", "aPack", "bName", "bPrice", "bPack"].forEach((id) => $(id).addEventListener("input", compareNow));
      fillUnits(); priceNow(); compareNow();
    },
  };

  /* ============== EXECUTIVE SUMMARY (president landing) ============== */
  PAGES.summary = {
    title: "Executive Summary",
    crumb: "Executive Summary",
    render() {
      const tot = P.aggregate(P.SKUS);
      const cats = P.categoryGroups();
      const shops = P.shops();
      const opps = P.opportunities();
      const dq = P.dataQuality();
      const dups = P.vendorDuplicates();
      const ap = P.apSavingsAll();
      const atRisk = (P.SKUS || []).filter((s) => s.annualSavings > 0 && (!s.implementationStatus || s.implementationStatus === "Not Reviewed"));
      const atRiskSavings = Math.round(atRisk.reduce((a, s) => a + s.annualSavings, 0));

      const hero = `<div class="shader-hero">
        <canvas class="shader-hero-canvas" id="heroCanvas"></canvas>
        <div class="shader-hero-overlay">
          <div class="sh-badge animate-fade-in-down"><span>⚓</span> Rental President Briefing</div>
          <h1 class="sh-headline">
            <span class="sh-line1 animate-fade-in-up sh-delay-200">Decentralized buying,</span>
            <span class="sh-line2 animate-fade-in-up sh-delay-400">centralized savings.</span>
          </h1>
          <p class="sh-subtitle animate-fade-in-up sh-delay-600">See every dollar of spend across your shops and vendors — and exactly where <b>${fmt.money(tot.savingsOpportunity)}</b> of savings is hiding.</p>
          <div class="sh-buttons animate-fade-in-up sh-delay-800">
            <a class="sh-btn-primary" href="#/savings">📉 View savings opportunities</a>
            <a class="sh-btn-secondary" href="#/ask">🤖 Ask the AI analyst</a>
          </div>
          <div class="sh-stats animate-fade-in-up sh-delay-800">
            <div><div class="hs-num">${fmt.money(tot.savingsOpportunity)}</div><div class="hs-lbl">Identified savings</div></div>
            <div class="hs-div"></div>
            <div><div class="hs-num" style="color:#9fe0cb">${fmt.pct(tot.savingsPercentage)}</div><div class="hs-lbl">vs. baseline spend</div></div>
            <div class="hs-div"></div>
            <div><div class="hs-num">${fmt.money(tot.baselineSpend)}</div><div class="hs-lbl">Annual spend analyzed</div></div>
          </div>
        </div>
      </div>`;

      if (!(P.SKUS || []).length && !ap.hasData) {
        return `${hero}<div class="notice" style="margin-bottom:0">📭 No data yet. Load your catalog in <a href="#/admin">Admin</a> and upload vendor sales reports in <a href="#/vendorspend">Vendor Spend</a> to populate this summary.</div>`;
      }

      const kpis = `<div class="grid cols-4" style="margin-bottom:16px">
        ${U.statCard({ label: "Identified Savings", value: fmt.money(tot.savingsOpportunity), delta: "▼ " + fmt.pct(tot.savingsPercentage) + " vs baseline", accent: "green", icon: "📉", iconBg: "var(--green-bg)" })}
        ${U.statCard({ label: "Savings at Risk", value: fmt.money(atRiskSavings), delta: atRisk.length + " SKUs unreviewed", deltaClass: "text-amber", accent: "amber", icon: "⏳", iconBg: "var(--amber-bg)" })}
        ${U.statCard({ label: "Invoiced Spend (AP)", value: ap.hasData ? fmt.money(ap.totals.actualSpend) : "—", delta: ap.hasData ? "actual volume" : "upload reports", deltaClass: "text-muted", accent: "navy", icon: "🧾", iconBg: "var(--navy-50)" })}
        ${U.statCard({ label: "Items to Review", value: fmt.num(dq.counts.negative + dq.counts.outliers + dups.length), delta: dups.length + " dup vendor SKUs", deltaClass: "text-muted", accent: "blue", icon: "🚩", iconBg: "var(--blue-bg)" })}
      </div>`;

      const topOpps = opps.slice(0, 6).map((o) => `<tr class="row-link" onclick="location.hash='#/savings'">
        <td><span class="cell-strong">${esc(o.subcategory)}</span><div class="cell-sub">${esc(o.category)} · ${esc(o.shopCode)}</div></td>
        <td>${esc(o.recommendedSupplier)}</td>
        <td>${U.savingsBadge(o.savingsPercentage)}</td>
        <td>${o.badges[0] ? U.oppBadge(o.badges[0]) : ""}</td></tr>`).join("");
      const maxShop = mx(shops.map((s) => s.savingsOpportunity));
      const shopBars = shops.slice().sort((a, b) => b.savingsOpportunity - a.savingsOpportunity).slice(0, 8)
        .map((s) => U.hbar(s.shopName, s.savingsOpportunity, maxShop, fmt.moneyShort(s.savingsOpportunity))).join("");

      return `${hero}${kpis}
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">🗂️ Spend by category</h3>${U.donut(cats.map((c) => ({ label: c.categoryName, value: c.savingsOpportunity, color: c.color })))}</div>
          <div class="card"><h3 class="card-title">🏆 Top savings opportunities</h3>
            ${topOpps ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:420px"><thead><tr><th>Opportunity</th><th>Vendor</th><th>Savings</th><th>Flag</th></tr></thead><tbody>${topOpps}</tbody></table></div>` : `<div class="cell-sub">No opportunities yet.</div>`}
          </div>
        </div>
        <div class="card" style="margin-bottom:16px"><h3 class="card-title">🏬 Savings by shop</h3>${shopBars || `<div class="cell-sub">No shop data.</div>`}</div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">🧭 Where to go next</h3>
          </div>
          <div class="tag-cats" style="margin-top:6px">
            <a class="badge blue" href="#/vendorspend" style="text-decoration:none">🧾 Vendor Spend</a>
            <a class="badge blue" href="#/patterns" style="text-decoration:none">📅 Buying Patterns</a>
            <a class="badge blue" href="#/shops" style="text-decoration:none">🏬 Shop View</a>
            <a class="badge blue" href="#/savings" style="text-decoration:none">📉 Savings Opportunities</a>
            <a class="badge blue" href="#/ask" style="text-decoration:none">🤖 Ask AI</a>
            <a class="badge blue" href="#/quality" style="text-decoration:none">🧹 Data Quality</a>
          </div>
        </div>`;
    },
    mount() {
      const canvas = document.getElementById("heroCanvas");
      if (canvas && window.ShaderHero) window.ShaderHero.mount(canvas);
    },
  };

  /* ============== SAVINGS REALIZATION (found vs captured) ============== */
  PAGES.realization = {
    title: "Savings Realization",
    crumb: "Savings Realization",
    render() {
      const canEdit = State.role === "Procurement Admin";
      const head = `<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div><h1>🎯 Savings Realization</h1><p>How much of the identified savings is actually being captured — from opportunity to approved to implemented.</p></div>
          ${canEdit ? `<button class="btn btn-outline btn-sm" id="snapBtn">📸 Capture snapshot</button>` : ""}
        </div>`;
      if (!(P.SKUS || []).length) return `${head}${emptyState("Load your catalog and set implementation statuses to track realization.")}`;
      const f = P.savingsFunnel();
      const snaps = (P.SNAPSHOTS || []).slice(-12);

      const bar = (label, val, color) => {
        const pct = f.identified > 0 ? Math.max(2, (val / f.identified) * 100) : 0;
        return `<div class="bar-row"><div class="bl">${label}</div>
          <div class="hbar"><span style="width:${pct}%;background:${color}"></span></div>
          <div class="bv">${fmt.moneyShort(val)} · ${f.identified > 0 ? Math.round(val / f.identified * 100) : 0}%</div></div>`;
      };
      const maxSnap = mx(snaps.map((s) => s.implemented));
      const trend = snaps.length > 1
        ? snaps.map((s) => U.hbar(s.date, s.implemented, maxSnap, fmt.moneyShort(s.implemented))).join("")
        : `<div class="cell-sub">Trend builds as snapshots accrue — captured automatically each day you visit, or hit “Capture snapshot”.</div>`;
      const catBars = f.byCategory.length ? (() => { const m = mx(f.byCategory.map((x) => x.value)); return f.byCategory.slice(0, 8).map((x) => U.hbar(x.name, x.value, m, fmt.moneyShort(x.value))).join(""); })() : `<div class="cell-sub">No implemented savings yet.</div>`;
      const shopBars = f.byShop.length ? (() => { const m = mx(f.byShop.map((x) => x.value)); return f.byShop.slice(0, 8).map((x) => U.hbar(x.name, x.value, m, fmt.moneyShort(x.value))).join(""); })() : `<div class="cell-sub">No implemented savings yet.</div>`;

      return `${head}
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Identified", value: fmt.money(f.identified), accent: "navy", icon: "🔍", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Approved", value: fmt.money(f.approved), delta: fmt.pct(f.approvedPct) + " of identified", deltaClass: "text-muted", accent: "blue", icon: "👍", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "Realized (Implemented)", value: fmt.money(f.realized), delta: "▼ captured", deltaClass: "text-green", accent: "green", icon: "✅", iconBg: "var(--green-bg)" })}
          ${U.statCard({ label: "Capture Rate", value: fmt.pct(f.capturedPct), delta: fmt.money(f.remaining) + " still on the table", deltaClass: "text-amber", accent: "amber", icon: "🎯", iconBg: "var(--amber-bg)" })}
        </div>
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">🪜 Realization funnel</h3>
            ${bar("Identified", f.identified, "var(--navy-700)")}
            ${bar("In review", f.inReview, "var(--sand)")}
            ${bar("Approved", f.approved, "var(--sky)")}
            ${bar("Realized", f.realized, "var(--sage)")}
          </div>
          <div class="card"><h3 class="card-title">📈 Realized savings over time</h3>${trend}</div>
        </div>
        <div class="grid cols-2">
          <div class="card"><h3 class="card-title">🗂️ Realized by category</h3>${catBars}</div>
          <div class="card"><h3 class="card-title">🏬 Realized by shop</h3>${shopBars}</div>
        </div>`;
    },
    mount() {
      const snap = async (announce) => {
        try { if (window.Store && window.Store.available()) { await window.Store.saveSnapshot(); if (announce) window.App.renderCurrent(); } }
        catch (_) { /* ignore */ }
      };
      const btn = document.getElementById("snapBtn");
      if (btn) btn.addEventListener("click", () => snap(true));
      // Auto-capture once per day (admins only) so the trend builds on its own.
      if (State.role === "Procurement Admin" && (P.SKUS || []).length) {
        const today = new Date().toISOString().slice(0, 10);
        if (!(P.SNAPSHOTS || []).some((s) => s.date === today)) snap(true);
      }
    },
  };

  /* ============== PRICE COMPLIANCE (invoice vs contract) ============== */
  PAGES.compliance = {
    title: "Price Compliance",
    crumb: "Price Compliance",
    render() {
      const head = `<div class="page-head"><h1>⚖️ Price Compliance <span class="badge navy" style="vertical-align:middle">Invoice vs. contract</span></h1>
        <p>Are you actually paying contracted prices? This compares every invoiced line to the vendor's contract and flags <b>overpayments</b> and <b>off-contract spend</b> — recoverable savings hiding in plain sight.</p></div>`;
      const c = P.priceCompliance();
      if (!c.hasAp) {
        return `${head}<div class="notice">🧾 Upload vendor sales reports / invoices on <a href="#/vendorspend">Vendor Spend</a> first — that's the "what you paid" side.</div>`;
      }
      if (!c.hasContracts) {
        return `${head}<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">📄 No contracts on file. Upload vendor contracts / rate sheets in <a href="#/admin">Admin</a> so there's a negotiated price to compare invoices against.</div>`;
      }
      const t = c.totals;
      const overRows = c.overRows.slice(0, 15).map((r) => `<tr>
          <td class="cell-strong">${esc(r.item)}${r.sku ? ` <span class="mono cell-sub">${esc(r.sku)}</span>` : ""}<div class="cell-sub">${esc(r.vendor)}${r.shop ? " · " + esc(r.shop) : ""}</div></td>
          <td class="num">${fmt.num(r.qty)}</td>
          <td class="num text-red">${fmt.money(r.paidEach, 2)}</td>
          <td class="num">${fmt.money(r.contractEach, 2)}</td>
          <td class="num cell-strong text-red">${fmt.money(r.over)}</td>
          <td class="cell-sub">${esc(r.date || "")}</td></tr>`).join("");
      const uomRows = c.uomRows.slice(0, 12).map((r) => `<tr>
          <td class="cell-strong">${esc(r.item)}${r.sku ? ` <span class="mono cell-sub">${esc(r.sku)}</span>` : ""}<div class="cell-sub">${esc(r.vendor)}</div></td>
          <td class="num">${fmt.money(r.paidEach, 2)}</td>
          <td class="num">${fmt.money(r.contractEach, 2)}</td>
          <td class="num text-amber cell-strong">${r.ratio}×</td>
          <td class="cell-sub">vs “${esc(r.match)}”</td></tr>`).join("");
      const offRows = c.offRows.slice(0, 12).map((r) => `<tr>
          <td class="cell-strong">${esc(r.item)}${r.sku ? ` <span class="mono cell-sub">${esc(r.sku)}</span>` : ""}</td>
          <td>${esc(r.vendor)}</td><td>${esc(r.shop || "—")}</td>
          <td class="num">${fmt.money(r.amount)}</td><td class="cell-sub">${esc(r.date || "")}</td></tr>`).join("");
      const vendRows = c.byVendor.slice(0, 10).map((v) => `<tr>
          <td class="cell-strong">${esc(v.vendor)}</td>
          <td class="num">${fmt.money(v.invoiced)}</td>
          <td class="num ${v.overpayment ? "text-red" : ""}">${fmt.money(v.overpayment)}</td>
          <td class="num ${v.offContract ? "text-amber" : ""}">${fmt.money(v.offContract)}</td></tr>`).join("");

      return `${head}
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Recoverable Leakage", value: fmt.money(t.leakage), delta: "overpay + off-contract", deltaClass: "text-red", accent: "red", icon: "💸", iconBg: "var(--red-bg)" })}
          ${U.statCard({ label: "Overpayment", value: fmt.money(t.overpayment), delta: c.overRows.length + " lines above contract", deltaClass: "text-red", accent: "amber", icon: "⚠️", iconBg: "var(--amber-bg)" })}
          ${U.statCard({ label: "Off-Contract Spend", value: fmt.money(t.offContract), delta: fmt.pct(t.offContractPct) + " of invoiced", deltaClass: "text-amber", accent: "navy", icon: "🧾", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "On-Contract", value: fmt.pct(t.onContractPct), delta: fmt.num(t.checked) + " checked · " + fmt.num(t.uomFlagged) + " UoM flags", deltaClass: "text-muted", accent: "green", icon: "✅", iconBg: "var(--green-bg)" })}
        </div>
        <div class="card" style="margin-bottom:16px;border-left:3px solid var(--red)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">⚠️ Overpayments — paid above contract <span class="cell-sub">(per each)</span></h3>
            <button class="btn btn-primary btn-sm" id="compBrief">🧠 Summarize &amp; recommend</button>
          </div>
          <div id="compOut" style="margin:8px 0 4px"></div>
          ${c.overRows.length ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:720px"><thead><tr><th>Item / vendor</th><th class="num">Qty</th><th class="num">Paid/ea</th><th class="num">Contract/ea</th><th class="num">Overpaid</th><th>Date</th></tr></thead><tbody>${overRows}</tbody></table></div>${c.overRows.length > 15 ? `<div class="cell-sub" style="margin-top:8px">+ ${c.overRows.length - 15} more…</div>` : ""}` : `<div class="cell-sub">✅ No lines invoiced above contract price.</div>`}
        </div>
        ${c.uomRows.length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--sand)">
          <h3 class="card-title">📐 Likely UoM mismatches — review (${c.uomRows.length})</h3>
          <p class="cell-sub" style="margin-top:-4px">These per-each prices differ by more than ${"6"}× vs contract — almost always a pack/case vs each mismatch, not a real overpayment. They're excluded from the overpayment total until reconciled. Use the <a href="#/uom">UoM Converter</a> to confirm pack sizes.</p>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:560px"><thead><tr><th>Item / vendor</th><th class="num">Paid/ea</th><th class="num">Contract/ea</th><th class="num">Ratio</th><th>Matched to</th></tr></thead><tbody>${uomRows}</tbody></table></div>
        </div>` : ""}
        <div class="grid cols-2">
          <div class="card"><h3 class="card-title">🧾 Off-contract (maverick) spend</h3>
            ${c.offRows.length ? `<div class="table-wrap" style="border:none"><table class="data" style="min-width:420px"><thead><tr><th>Item</th><th>Vendor</th><th>Shop</th><th class="num">Spend</th><th>Date</th></tr></thead><tbody>${offRows}</tbody></table></div>` : `<div class="cell-sub">✅ Everything maps to a contract.</div>`}
          </div>
          <div class="card"><h3 class="card-title">🤝 Leakage by vendor</h3>
            <div class="table-wrap" style="border:none"><table class="data" style="min-width:420px"><thead><tr><th>Vendor</th><th class="num">Invoiced</th><th class="num">Overpay</th><th class="num">Off-contract</th></tr></thead><tbody>${vendRows}</tbody></table></div>
          </div>
        </div>
        <div class="cell-sub" style="margin-top:12px">Every comparison is normalized to <b>price per each</b> (pack/case sizes divided out automatically). Lines are matched to contract items by vendor + fuzzy product name. Implausible ratios are quarantined as likely UoM issues above.</div>`;
    },
    mount() {
      const btn = document.getElementById("compBrief");
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const c = P.priceCompliance();
        const out = document.getElementById("compOut");
        out.innerHTML = `<div class="notice">⏳ Analyzing price compliance…</div>`;
        const ctx = {
          totals: c.totals,
          topOverpayments: c.overRows.slice(0, 15).map((r) => ({ item: r.item, vendor: r.vendor, paidEach: r.paidEach, contractEach: r.contractEach, overpaid: r.over })),
          topOffContract: c.offRows.slice(0, 12).map((r) => ({ item: r.item, vendor: r.vendor, spend: r.amount })),
          byVendor: c.byVendor.slice(0, 10),
        };
        const q = "Act as a procurement recovery analyst. From this price-compliance data, summarize total recoverable leakage, name the worst vendors and items for overpayment and off-contract spend, and give 3 concrete recovery actions (credit-back requests, move maverick spend onto contract, renegotiate). About 150 words.";
        try {
          out.innerHTML = `<div class="ai-answer">${esc(await window.AI.ask(q, ctx) || "No summary returned.").replace(/\n/g, "<br>")}</div>`;
        } catch (e) {
          out.innerHTML = `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber)">⚠️ ${esc(e.message || String(e))}</div>`;
        }
      });
    },
  };

  /* ============== VENDOR SPEND (vendor sales reports) ============== */
  PAGES.vendorspend = {
    title: "Vendor Spend",
    crumb: "Vendor Spend",
    render() {
      const canEdit = State.role === "Procurement Admin";
      const hasData = (P.AP || []).length > 0;
      const head = `<div class="page-head"><h1>🧾 Vendor Spend <span class="badge navy" style="vertical-align:middle">Sales reports</span></h1>
        <p>Upload vendor sales reports to see spend, volume, and SKU trends — reconciled to your shops — so leadership can spot expenses and cost-savings opportunities at a glance.</p></div>`;
      const upload = canEdit ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <input type="text" id="vsVendorName" placeholder="Vendor for this report (e.g. SoJo)" style="padding:7px 10px;border:1px solid var(--gray-200);border-radius:9px;font-size:13px;min-width:190px">
          <input type="text" id="vsCategory" value="Disposables" title="Category applied to every line in this report" style="padding:7px 10px;border:1px solid var(--gray-200);border-radius:9px;font-size:13px;min-width:140px">
          <input type="file" id="vsFile" accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.txt,.tsv" style="display:none">
          <button class="btn btn-primary btn-sm" id="vsUpload">🤖 Upload vendor sales report</button>
          ${hasData ? `<button class="btn btn-outline btn-sm" id="vsClear">🗑 Clear spend data</button>` : ""}
          <span class="cell-sub" id="vsMsg"></span>
        </div>
        <div class="cell-sub" style="margin:-8px 0 16px">Reads every tab — only true line-item sheets (amount + item + date) are imported; summary/order/defect tabs are skipped. Customer/property names fuzzy-match to your brands.</div>` : "";

      if (!hasData) {
        return `${head}${upload}<div class="card"><h3 class="card-title">Get started</h3>
          <p class="text-muted" style="max-width:620px">Upload a vendor's sales report in any format — Excel, CSV, PDF, or an image. Claude maps the columns (shop, SKU, vendor, date, amount, quantity), fuzzy-matches shop names to your brands, and flags duplicate SKUs. Then this page shows spend &amp; volume trends by vendor, category, and SKU.</p>
          ${canEdit ? "" : `<div class="notice" style="margin-top:12px">Ask a Procurement Admin to upload vendor reports.</div>`}</div>`;
      }

      const sel = State.vendorFilter && (P.apVendors().includes(State.vendorFilter) || State.vendorFilter === "All") ? State.vendorFilter : "All";
      const vOpts = [`<option value="All" ${sel === "All" ? "selected" : ""}>All vendors</option>`].concat(P.apVendors().map((v) => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`)).join("");
      const m = P.apVendorSummary(sel);
      const unmatched = P.unmatchedApShops();
      const disc = P.apPriceDiscrepancies(sel);

      const trend = m.trend.slice(-12);
      const maxTrend = mx(trend.map((t) => t.amount));
      const trendBars = trend.length ? trend.map((t) => U.hbar(t.ym, t.amount, maxTrend, fmt.moneyShort(t.amount))).join("") : `<div class="cell-sub">No dated lines.</div>`;
      const maxVend = mx(m.byVendor.map((v) => v.spend));
      const vendBars = m.byVendor.slice(0, 8).map((v) => U.hbar(v.vendor, v.spend, maxVend, fmt.moneyShort(v.spend) + ` · ${fmt.num(v.skus)} SKUs`)).join("");
      const topRows = m.topSkus.map((s) => `<tr>
          <td class="cell-strong">${esc(s.name)}${s.sku ? ` <span class="mono cell-sub">${esc(s.sku)}</span>` : ""}</td>
          <td>${esc(s.vendor)}</td><td>${esc(s.category)}</td>
          <td class="num">${fmt.num(s.qty)}</td><td class="num cell-strong">${fmt.money(s.spend)}</td></tr>`).join("");

      const reconcile = (canEdit && unmatched.length) ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--sand)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h3 class="card-title" style="margin:0">🏬 New shops detected (${unmatched.length})</h3>
            <button class="btn btn-primary btn-sm" id="vsAddAllShops">➕ Add all as new shops</button>
          </div>
          <p class="cell-sub" style="margin-top:4px">These property names from the report aren't in your shop list yet — by default they're treated as <b>new shops</b>. Add them, or map one to an existing shop only if it's just an alias.</p>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:680px"><thead><tr><th>Report name</th><th class="num">Lines</th><th class="num">Spend</th><th>Action</th></tr></thead><tbody>
          ${unmatched.map((u) => `<tr>
            <td class="cell-strong">${esc(u.raw)}</td><td class="num">${u.count}</td><td class="num">${fmt.money(u.spend)}</td>
            <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-green btn-sm" data-addshop="${esc(u.raw)}">➕ New shop</button>
              <span class="cell-sub">or map →</span>
              <select class="approve-select" data-recon="${esc(u.raw)}" style="max-width:none"><option value="">existing shop…</option>${(P.SHOPS || []).map((b) => `<option ${b.shopName === u.suggestion ? "selected" : ""}>${esc(b.shopName)}</option>`).join("")}</select>
              <button class="btn btn-outline btn-sm" data-recon-apply="${esc(u.raw)}">Map</button>
            </td>
          </tr>`).join("")}
          </tbody></table></div></div>` : "";

      const dupPanel = disc.rows.length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--sand)">
          <h3 class="card-title">💸 Price discrepancies — same SKU, different price (${disc.rows.length})</h3>
          <p class="cell-sub" style="margin-top:-4px">The same item invoiced at different per-each prices across shops/periods. Aligning every line to the lowest per-each actually paid would recover about <b class="text-green">${fmt.money(disc.total)}</b>.</p>
          <div class="table-wrap" style="border:none"><table class="data" style="min-width:720px"><thead><tr><th>Product</th><th>SKU</th><th class="num">Shops</th><th class="num">Low/ea</th><th class="num">High/ea</th><th class="num">Spread</th><th class="num">Recover</th></tr></thead><tbody>
          ${disc.rows.slice(0, 15).map((d) => `<tr>
            <td class="cell-strong">${esc(d.name)}<div class="cell-sub">${esc(d.vendor || "—")}${d.category ? " · " + esc(d.category) : ""}</div></td>
            <td class="mono cell-sub">${esc(d.sku || "—")}</td>
            <td class="num">${d.shops}</td>
            <td class="num">${fmt.money(d.min, 2)}</td>
            <td class="num text-red">${fmt.money(d.max, 2)} <span class="cell-sub">(${d.ratio}×)</span></td>
            <td class="num">${fmt.money(d.spread, 2)}</td>
            <td class="num cell-strong text-green">${fmt.money(d.potential)}</td></tr>`).join("")}
          </tbody></table></div>${disc.rows.length > 15 ? `<div class="cell-sub" style="margin-top:8px">+ ${disc.rows.length - 15} more…</div>` : ""}</div>` : "";

      const newVbar = (canEdit && State.vsNewVendor) ? `<div class="notice" style="background:var(--amber-bg);border-color:#f3d9a8;color:var(--amber);margin-bottom:14px">🆕 “${esc(State.vsNewVendor)}” isn't in your vendor list yet. <button class="btn btn-primary btn-sm" id="vsAddVendor" style="margin-left:8px">Add to vendor list</button> <button class="btn btn-outline btn-sm" id="vsDismissVendor">Dismiss</button></div>` : "";
      return `${head}${upload}${newVbar}
        <div class="toolbar"><div class="field" style="margin:0;min-width:240px"><label>Vendor${sel !== "All" ? ` — showing <b>${esc(sel)}</b>` : ""}</label><select id="vsVendor" class="approve-select" style="max-width:none;width:100%">${vOpts}</select></div></div>
        <div class="grid cols-4" style="margin-bottom:16px">
          ${U.statCard({ label: "Total Spend", value: fmt.money(m.totalSpend), accent: "navy", icon: "💵", iconBg: "var(--navy-50)" })}
          ${U.statCard({ label: "Total Volume (units)", value: fmt.num(m.totalQty), accent: "blue", icon: "📦", iconBg: "var(--blue-bg)" })}
          ${U.statCard({ label: "Distinct SKUs", value: fmt.num(m.distinctSkus), accent: "green", icon: "🏷️", iconBg: "var(--green-bg)" })}
          ${U.statCard({ label: "Vendors", value: fmt.num(m.vendorCount), accent: "navy", icon: "🤝", iconBg: "var(--navy-50)" })}
        </div>
        ${reconcile}
        ${dupPanel}
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">📈 Spend by month</h3>${trendBars}</div>
          <div class="card"><h3 class="card-title">🤝 Spend by vendor</h3>${vendBars || `<div class="cell-sub">No vendor data.</div>`}</div>
        </div>
        <div class="grid cols-2" style="margin-bottom:16px">
          <div class="card"><h3 class="card-title">🗂️ Spend by category</h3>${U.donut(m.byCategory.map((c) => ({ label: c.name, value: c.value, color: (P.CATEGORY_META[c.name] || {}).color || "var(--teal)" })))}</div>
          <div class="card"><h3 class="card-title">🏆 Top SKUs by spend</h3>
            <div class="table-wrap" style="border:none"><table class="data" style="min-width:480px"><thead><tr><th>Product</th><th>Vendor</th><th>Category</th><th class="num">Qty</th><th class="num">Spend</th></tr></thead><tbody>${topRows}</tbody></table></div>
          </div>
        </div>`;
    },
    mount() {
      const rerender = () => window.App.renderCurrent();
      const vsel = document.getElementById("vsVendor");
      if (vsel) vsel.addEventListener("change", () => { State.vendorFilter = vsel.value; rerender(); });

      // Add an unmatched report name as a brand-new shop (its AP lines already
      // carry that name, so it's recognized once the brand exists).
      const addShop = async (raw) => { P.upsertBrand({ shopName: raw, code: P.nextBrandCode(), region: "" }); };
      document.querySelectorAll("[data-addshop]").forEach((b) => b.addEventListener("click", async () => {
        b.disabled = true;
        await addShop(b.getAttribute("data-addshop"));
        try { if (window.Store && window.Store.available()) await window.Store.pushAll(); } catch (_) { /* ignore */ }
        rerender();
      }));
      const addAll = document.getElementById("vsAddAllShops");
      if (addAll) addAll.addEventListener("click", async () => {
        addAll.disabled = true;
        P.unmatchedApShops().forEach((u) => addShop(u.raw));
        try { if (window.Store && window.Store.available()) await window.Store.pushAll(); } catch (_) { /* ignore */ }
        rerender();
      });

      document.querySelectorAll("[data-recon-apply]").forEach((b) => b.addEventListener("click", async () => {
        const raw = b.getAttribute("data-recon-apply");
        const sel = document.querySelector(`[data-recon="${(window.CSS && CSS.escape) ? CSS.escape(raw) : raw}"]`);
        const to = sel && sel.value;
        if (!to) { b.textContent = "pick a shop"; return; }
        b.disabled = true; b.textContent = "Applying…";
        P.remapApShop(raw, to);
        try { if (window.Store && window.Store.available()) await window.Store.pushAp(); } catch (_) { /* ignore */ }
        rerender();
      }));

      const btn = document.getElementById("vsUpload");
      const file = document.getElementById("vsFile");
      const msg = document.getElementById("vsMsg");
      if (btn && file) {
        btn.addEventListener("click", () => file.click());
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const vendor = ((document.getElementById("vsVendorName") || {}).value || "").trim();
          const category = ((document.getElementById("vsCategory") || {}).value || "").trim();
          msg.textContent = "🤖 Reading " + f.name + " (all tabs)…";
          try {
            const { added, sheets } = await ingestSpendFile(f, { vendor, category });
            if (!added) { msg.textContent = "⚠️ No line-item spend found. Make sure a tab has amount + item + date columns."; return; }
            msg.textContent = `Saving ${added} lines…`;
            if (window.Store && window.Store.available()) await window.Store.pushAp();
            State.vsLastImport = `Imported ${added} line(s)${vendor ? " for " + vendor : ""} from: ${(sheets || []).join(", ") || "file"}.`;
            if (vendor) { State.vendorFilter = vendor; State.vsNewVendor = P.newVendorsAmong([vendor]).length ? vendor : null; }
            rerender();
          } catch (e) { msg.textContent = "⚠️ " + (e.message || e); }
          finally { file.value = ""; }
        });
      }
      if (State.vsLastImport) { const mm = document.getElementById("vsMsg"); if (mm) mm.innerHTML = `<span class="text-green">✅ ${esc(State.vsLastImport)}</span>`; State.vsLastImport = null; }
      const addV = document.getElementById("vsAddVendor");
      if (addV) addV.addEventListener("click", async () => {
        P.addVendorRecord({ name: State.vsNewVendor, category: "Linen, Laundry & Supplies" });
        try { if (window.Store && window.Store.available()) await window.Store.saveVendors(P.vendorMaster()); } catch (_) { /* ignore */ }
        State.vsNewVendor = null; rerender();
      });
      const disV = document.getElementById("vsDismissVendor");
      if (disV) disV.addEventListener("click", () => { State.vsNewVendor = null; rerender(); });
      const clr = document.getElementById("vsClear");
      if (clr) clr.addEventListener("click", async () => {
        if (!confirm("Remove ALL uploaded vendor/AP spend data?")) return;
        P.apClear();
        try { if (window.Store && window.Store.available()) await window.Store.pushAp(); } catch (_) { /* ignore */ }
        rerender();
      });
    },
  };

  // expose helpers used by app shell
  window.PAGE_HELPERS = { State };
})();
