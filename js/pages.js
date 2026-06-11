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
    role: "Procurement Admin",
  });

  const PAGES = (window.PAGES = {});

  /* ============================== DASHBOARD ============================== */
  PAGES.dashboard = {
    title: "Dashboard",
    crumb: "Dashboard",
    render() {
      const cats = P.categories();
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
        <h1>Procurement Savings Portal</h1>
        <p>A centralized view of decentralized purchasing opportunities across products, SKUs, vendors, shops, and categories. Track old pricing, negotiated pricing, and savings opportunities by category, subcategory, vendor, and shop.</p>
      </div>

      ${P.SKUS.length ? "" : `<div class="notice" style="margin-bottom:18px">📭 No data loaded yet. Head to the <a href="#/admin">Admin tab</a> to upload an Excel of products, OCR a price list, or load the sample dataset.</div>`}

      <div class="grid cols-4">${kpis.join("")}</div>
      <div class="grid cols-4" style="margin-top:16px">${kpis2.join("")}</div>

      <div class="section-title">Category Breakdown</div>
      <div class="grid cols-4">${cats.map(U.categoryTile).join("")}</div>

      <div class="grid cols-2" style="margin-top:22px">
        <div class="card"><h3 class="card-title">📊 Savings by Category</h3>${catBars}</div>
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
      const cats = P.categories();
      const active = params[0] ? decodeURIComponent(params[0]) : null;
      if (!active) {
        return `<div class="page-head"><h1>Category Menu</h1><p>Select a category to drill into subcategories, savings, and recommended suppliers.</p></div>
          <div class="grid cols-3">${cats.map(U.categoryTile).join("")}</div>`;
      }
      const meta = P.CATEGORY_META[active] || { icon: "📦", color: "var(--navy)" };
      const subs = P.subcategoriesFor(active);
      const agg = P.aggregate(P.SKUS.filter((s) => s.category === active));
      const pills = cats.map((c) => `<a class="pill ${c.categoryName === active ? "active" : ""}" href="#/categories/${encodeURIComponent(c.categoryName)}">${c.icon} ${esc(c.categoryName)}</a>`).join("");

      const subCards = subs.length ? subs.map((s) => `
        <div class="card" style="border-top:3px solid ${meta.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <h3 class="card-title" style="margin-bottom:4px">${esc(s.subcategoryName)}</h3>
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
            <a class="btn btn-outline btn-sm" href="#/catalog?category=${encodeURIComponent(active)}&subcategory=${encodeURIComponent(s.subcategoryName)}">View SKUs →</a>
          </div>
        </div>`).join("") : `<div class="empty">No SKUs loaded for ${esc(active)} yet.</div>`;

      return `
        <div class="page-head"><h1>${meta.icon} ${esc(active)}</h1><p>Drill into ${esc(active)} subcategories. Each card shows current vs. negotiated spend, savings, and review status.</p></div>
        <div class="pillbar">${pills}</div>
        <div class="grid cols-4" style="margin-bottom:20px">
          ${U.statCard({ label: "Baseline", value: fmt.money(agg.baselineSpend), accent: "navy" })}
          ${U.statCard({ label: "Negotiated", value: fmt.money(agg.newSpend), accent: "blue" })}
          ${U.statCard({ label: "Savings", value: fmt.money(agg.savingsOpportunity), delta: "▼ " + fmt.pct(agg.savingsPercentage), accent: "green" })}
          ${U.statCard({ label: "SKUs", value: agg.skuCount, accent: "navy" })}
        </div>
        <div class="grid cols-3">${subCards}</div>`;
    },
  };

  /* ============================== SKU CATALOG ============================== */
  function filteredSkus() {
    const f = State.catalog;
    let rows = P.SKUS.slice();
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
      const allSubs = Array.from(new Set(P.SKUS.filter((s) => !f.category || s.category === f.category).map((s) => s.subcategory))).sort();
      const opt = (val, label, sel) => `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`;
      const catOpts = [""].concat(P.CATEGORY_ORDER).map((c) => opt(c, c || "All categories", f.category)).join("");
      const subOpts = `<option value="">All subcategories</option>` + allSubs.map((s) => opt(s, s, f.subcategory)).join("");
      const shopOpts = `<option value="">All shops</option>` + P.SHOPS.map((s) => opt(s.code, s.shopName, f.shop)).join("");
      const vendorList = Array.from(new Set(P.SKUS.flatMap((s) => [s.currentVendor, s.recommendedVendor]))).sort();
      const vendorOpts = `<option value="">All vendors</option>` + vendorList.map((v) => opt(v, v, f.vendor)).join("");
      const statusOpts = `<option value="">All statuses</option>` + P.STATUSES.map((s) => opt(s, s, f.status)).join("");

      const agg = P.aggregate(rows);
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
          <div class="grid cols-4" style="margin-bottom:16px">
            ${U.statCard({ label: "Filtered SKUs", value: fmt.num(agg.skuCount) })}
            ${U.statCard({ label: "Current Spend", value: fmt.money(agg.baselineSpend) })}
            ${U.statCard({ label: "New Spend", value: fmt.money(agg.newSpend) })}
            ${U.statCard({ label: "Savings", value: fmt.money(agg.savingsOpportunity), delta: "▼ " + fmt.pct(agg.savingsPercentage), accent: "green" })}
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

  /* ============================== SAVINGS ============================== */
  PAGES.savings = {
    title: "Savings Opportunities",
    crumb: "Savings Opportunities",
    render() {
      const opps = P.opportunities();
      const totals = P.aggregate(P.SKUS);
      const quickWins = opps.filter((o) => o.badges.includes("Quick Win"));
      const highValue = opps.filter((o) => o.annualSavings >= 8000);
      const lowRisk = opps.filter((o) => o.risk === "Low");
      const needsReview = opps.filter((o) => o.badges.includes("Needs Review"));
      const transitionRisk = opps.filter((o) => o.risk !== "Low");

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
      P.SKUS.forEach((s) => { (groups[keyFn(s)] = groups[keyFn(s)] || []).push(s); });
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
      <div class="grid cols-4" style="margin-bottom:8px">
        ${U.statCard({ label: "Total Opportunity", value: fmt.money(totals.savingsOpportunity), delta: "▼ " + fmt.pct(totals.savingsPercentage), accent: "green", icon: "📉", iconBg: "var(--green-bg)" })}
        ${U.statCard({ label: "Quick Wins", value: quickWins.length, delta: fmt.money(quickWins.reduce((s, o) => s + o.annualSavings, 0)), deltaClass: "text-green", accent: "green", icon: "⚡", iconBg: "var(--green-bg)" })}
        ${U.statCard({ label: "High-Value (≥$8K)", value: highValue.length, accent: "blue", icon: "💎", iconBg: "var(--blue-bg)" })}
        ${U.statCard({ label: "Low-Risk Standardization", value: lowRisk.length, accent: "navy", icon: "🛡️", iconBg: "var(--navy-50)" })}
      </div>
      <div class="grid cols-2" style="margin-bottom:18px">
        ${U.statCard({ label: "Items Requiring Local Review", value: needsReview.length, accent: "amber", icon: "👀", iconBg: "var(--amber-bg)" })}
        ${U.statCard({ label: "Items with Vendor Transition Risk", value: transitionRisk.length, accent: "amber", icon: "⚠️", iconBg: "var(--amber-bg)", deltaClass: "text-amber" })}
      </div>

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
  PAGES.shops = {
    title: "Shop View",
    crumb: "Shop View",
    render(params) {
      const shops = P.shops();
      const code = params[0] ? decodeURIComponent(params[0]) : null;
      if (!code) {
        const cards = shops.map((s) => `<a class="cat-tile" href="#/shops/${encodeURIComponent(s.code)}">
          <div class="tile-head" style="background:var(--navy)"><span class="ic">🏬</span><span class="nm">${esc(s.shopName)}</span></div>
          <div class="tile-body">
            <div class="tile-metric"><span class="k">Region</span><span class="v">${esc(s.region)}</span></div>
            <div class="tile-metric"><span class="k">Current spend</span><span class="v">${fmt.money(s.baselineSpend)}</span></div>
            <div class="tile-metric"><span class="k">New spend</span><span class="v">${fmt.money(s.newSpend)}</span></div>
            <div class="tile-metric"><span class="k">Savings</span><span class="v text-green">${fmt.money(s.savingsOpportunity)}</span></div>
            <div class="tile-foot">${U.savingsBadge(s.savingsPercentage)}${U.statusBadge(s.implementationStatus)}</div>
          </div></a>`).join("");
        return `<div class="page-head"><h1>Shop View</h1><p>Decentralized shop dashboards. Each shop sees only its own relevant savings opportunities and action items.</p></div>
          <div class="grid cols-3">${cards}</div>`;
      }
      const shop = shops.find((s) => s.code === code);
      if (!shop) return `<div class="empty">Shop not found.</div>`;
      const tabs = ["Overview", "Linens", "Disposables", "Supplies", "Rentals", "Action Items"];
      const tab = State.shopTab && tabs.includes(State.shopTab) ? State.shopTab : "Overview";
      const tabBtns = tabs.map((t) => `<button class="${t === tab ? "active" : ""}" data-tab="${t}">${t}</button>`).join("");

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
        const rows = shop.rows.filter((r) => r.category === tab);
        tabContent = rows.length ? `<div class="table-wrap"><table class="data" style="min-width:780px"><thead><tr>
            <th>SKU</th><th>Product</th><th>Subcategory</th><th>Vendor → Rec.</th><th class="num">Current</th><th class="num">New</th><th class="num">Savings</th><th>%</th><th>Status</th>
          </tr></thead><tbody>${rows.map((r) => `<tr class="row-link" onclick="location.hash='#/comparison/${r.id}'">
            <td class="mono">${esc(r.sku || r.id)}</td><td class="cell-strong">${esc(r.productName)}</td><td>${esc(r.subcategory)}</td>
            <td>${esc(r.currentVendor)}<div class="cell-sub">→ ${esc(r.recommendedVendor)}</div></td>
            <td class="num">${fmt.money(r.currentAnnualSpend)}</td><td class="num text-green">${fmt.money(r.newAnnualSpend)}</td>
            <td class="num cell-strong text-green">${fmt.money(r.annualSavings)}</td><td>${U.savingsBadge(r.savingsPercentage)}</td><td>${U.statusBadge(r.implementationStatus)}</td>
          </tr>`).join("")}</tbody></table></div>` : `<div class="empty">No ${esc(tab)} SKUs assigned to ${esc(shop.shopName)}.</div>`;
      }

      return `
        <div class="page-head"><h1>🏬 ${esc(shop.shopName)}</h1><p>${esc(shop.region)} region · ${esc(shop.code)} · <a href="#/shops">← all shops</a></p></div>
        <div class="tabs" id="shopTabs">${tabBtns}</div>
        ${tabContent}`;
    },
    mount() {
      document.querySelectorAll("#shopTabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
        State.shopTab = b.getAttribute("data-tab");
        window.App.renderCurrent();
      }));
    },
  };

  /* ============================== VENDORS ============================== */
  PAGES.vendors = {
    title: "Vendors",
    crumb: "Vendors",
    render() {
      const vendors = P.vendorsView();
      const cards = vendors.map((v) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div><h3 class="card-title" style="margin-bottom:3px">🏷️ ${esc(v.vendorName)}</h3>
              <div class="card-sub">${esc(v.contractStatus)} · ${esc(v.pricingStatus)}</div></div>
            ${v.savingsOpportunity > 0 ? U.savingsBadge(v.skuCount ? (v.savingsOpportunity / v.currentSpend * 100) : 0) : ""}
          </div>
          <div class="tag-cats" style="margin:6px 0 12px">${v.categoriesSupplied.map((c) => `<span class="badge navy">${esc(c)}</span>`).join("")}</div>
          <div class="kv-grid">
            <span class="k">Current spend</span><span class="v">${fmt.money(v.currentSpend)}</span>
            <span class="k">Proposed spend</span><span class="v">${fmt.money(v.proposedSpend)}</span>
            <span class="k">Savings opportunity</span><span class="v text-green">${fmt.money(v.savingsOpportunity)}</span>
            <span class="k">SKUs (recommended)</span><span class="v">${v.skuCount}</span>
            <span class="k">Shops served</span><span class="v">${v.shopsServed.length}</span>
          </div>
          <div class="cell-sub" style="margin-top:12px;border-top:1px solid var(--gray-100);padding-top:10px">${esc(v.notes)}</div>
        </div>`).join("");

      // Current vs recommended comparison example
      const linenCurrent = P.SKUS.filter((s) => s.category === "Linens");
      const curSpend = P.round(linenCurrent.reduce((a, r) => a + r.currentAnnualSpend, 0));
      const newSpend = P.round(linenCurrent.reduce((a, r) => a + r.newAnnualSpend, 0));
      const sav = curSpend - newSpend;

      return `
        <div class="page-head"><h1>Vendor View</h1><p>Compare current vendors against recommended national vendors across categories, spend, and shop coverage.</p></div>
        <div class="card" style="margin-bottom:20px">
          <h3 class="card-title">🔄 Current vs. Recommended (Linens example)</h3>
          <div class="compare-grid">
            <div class="compare-col current"><h4>Current Vendors</h4>
              <div class="compare-row"><span class="k">Vendor</span><span class="v">Local / Regional Suppliers</span></div>
              <div class="compare-row"><span class="k">Annual spend</span><span class="v">${fmt.money(curSpend)}</span></div>
              <div class="compare-row"><span class="k">Contract</span><span class="v">Fragmented</span></div>
            </div>
            <div class="compare-arrow">➜</div>
            <div class="compare-col recommended"><h4>Recommended Vendor</h4>
              <div class="compare-row"><span class="k">Vendor</span><span class="v">Calderon Textiles</span></div>
              <div class="compare-row"><span class="k">Annual spend</span><span class="v text-green">${fmt.money(newSpend)}</span></div>
              <div class="compare-row"><span class="k">Savings</span><span class="v text-green">${fmt.money(sav)} (${fmt.pct(sav / curSpend * 100)})</span></div>
            </div>
          </div>
        </div>
        <div class="grid cols-3">${cards}</div>`;
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
          <b>${fmt.money(sku.annualSavings)}</b> per year (${fmt.pct(sku.savingsPercentage)}) on ${esc(sku.productName)}.</div>
        </div>
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
          ${U.statCard({ label: "Per-Unit Savings", value: fmt.money(sku.currentUnitPrice - sku.newUnitPrice, 2), delta: "▼ " + fmt.pct(sku.savingsPercentage), accent: "green" })}
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
      <div class="notice" style="margin-bottom:18px">ℹ️ This is a working front-end mockup. Uploaded/edited data updates the in-memory model for this session and can be exported to CSV.</div>

      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div><h3 class="card-title" style="margin:0">🗃️ Dataset</h3>
          <div class="cell-sub" id="dataStatus">${P.SHOPS.length} brand(s) · ${P.SKUS.length} SKU(s) loaded.</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="loadSample">⬇ Load sample data</button>
          <button class="btn btn-outline btn-sm" id="clearData" style="color:var(--red);border-color:var(--red)">🗑 Clear all data</button>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card"><h3 class="card-title">🤖 Upload raw files — AI extraction</h3>
          <p class="text-muted" style="font-size:12.5px;margin:0 0 10px">Drop an Excel/CSV sheet <b>or</b> a photo/scan/PDF of a price list or invoice. Multi-tab workbooks are fully supported — every product tab is scanned, the header row is detected automatically, section/subtotal rows are ignored, and SKUs repeated across tabs are merged. Claude fills in category, suppliers, SKU, baseline &amp; future spend, and more — review and edit below.</p>
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
  };

  // expose helpers used by app shell
  window.PAGE_HELPERS = { State };
})();
