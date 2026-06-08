/* =====================================================================
   App shell + hash router. Renders sidebar, topbar, and the active page.
   ===================================================================== */
(function () {
  "use strict";
  const P = window.PSP;
  const State = window.AppState;

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "📊", route: "#/dashboard" },
    { id: "categories", label: "Categories", icon: "🗂️", route: "#/categories" },
    { id: "catalog", label: "SKU Catalog", icon: "📦", route: "#/catalog" },
    { id: "savings", label: "Savings Opportunities", icon: "📉", route: "#/savings" },
    { id: "shops", label: "Shop View", icon: "🏬", route: "#/shops" },
    { id: "vendors", label: "Vendors", icon: "🏷️", route: "#/vendors" },
    { id: "comparison", label: "Product Comparison", icon: "🔄", route: "#/comparison" },
    { id: "tracker", label: "Implementation Tracker", icon: "✅", route: "#/tracker" },
    { id: "ai", label: "AI Categorization", icon: "🤖", route: "#/ai" },
    { id: "admin", label: "Admin", icon: "⚙️", route: "#/admin" },
  ];

  // page id -> permission key (some nav items map to same permission group)
  const PERM_KEY = { dashboard: "dashboard", categories: "categories", catalog: "catalog", savings: "savings", shops: "shops", vendors: "vendors", comparison: "comparison", tracker: "tracker", ai: "admin", admin: "admin" };

  function allowed(pageId) {
    const role = P.ROLES[State.role];
    if (!role || role.pages === "*") return true;
    return role.pages.includes(PERM_KEY[pageId]);
  }

  let current = { id: "dashboard", params: [] };

  function parseHash() {
    const raw = (location.hash || "#/dashboard").replace(/^#\//, "");
    const [pathPart] = raw.split("?");
    const segs = pathPart.split("/").filter(Boolean);
    const id = segs[0] || "dashboard";
    const params = segs.slice(1);
    // also surface query string into catalog filters
    const qIndex = raw.indexOf("?");
    if (qIndex >= 0) applyQuery(id, raw.slice(qIndex + 1));
    return { id: window.PAGES[id] ? id : "dashboard", params };
  }

  function applyQuery(id, qs) {
    const params = new URLSearchParams(qs);
    if (id === "catalog") {
      if (params.has("category")) State.catalog.category = params.get("category");
      if (params.has("subcategory")) State.catalog.subcategory = params.get("subcategory");
      if (params.has("shop")) State.catalog.shop = params.get("shop");
      if (params.has("vendor")) State.catalog.vendor = params.get("vendor");
    }
  }

  function renderSidebar() {
    const links = NAV.map((n) => {
      const isActive = n.id === current.id;
      const isAllowed = allowed(n.id);
      return `<a href="${n.route}" class="${isActive ? "active" : ""}" ${isAllowed ? "" : 'style="opacity:.4;pointer-events:none" title="Not available for this role"'}>
        <span class="ico">${n.icon}</span>${n.label}</a>`;
    }).join("");

    const roleOpts = Object.keys(P.ROLES).map((r) => `<option ${r === State.role ? "selected" : ""}>${r}</option>`).join("");
    return `
      <div class="brand">
        <div class="logo">📈</div>
        <div><div class="title">Savings Portal</div><div class="subtitle">Procurement Command Center</div></div>
      </div>
      <nav class="nav">
        <div class="nav-section">Overview</div>
        ${links}
      </nav>
      <div class="role-box">
        <label>Viewing as</label>
        <select id="roleSelect">${roleOpts}</select>
        <div class="role-desc">${P.ROLES[State.role].desc}</div>
      </div>`;
  }

  function renderTopbar() {
    const page = window.PAGES[current.id];
    const totals = P.aggregate(P.SKUS);
    return `
      <div class="crumb">Procurement &nbsp;/&nbsp; <b>${page.crumb}</b></div>
      <div class="global-search"><span class="si">🔍</span><input type="text" id="globalSearch" placeholder="Search SKUs, vendors, categories…"></div>
      <div class="badge green" title="Total savings opportunity">▼ ${P.fmt.money(totals.savingsOpportunity)} savings</div>
      <div class="user-chip"><div class="avatar">PA</div></div>`;
  }

  function renderCurrent() {
    current = parseHash();
    const page = window.PAGES[current.id];
    document.getElementById("sidebar").innerHTML = renderSidebar();
    document.getElementById("topbar").innerHTML = renderTopbar();

    const content = document.getElementById("content");
    if (!allowed(current.id)) {
      content.innerHTML = `<div class="page-head"><h1>Restricted</h1><p>The <b>${State.role}</b> role does not have access to ${page.crumb}.</p></div>
        <div class="empty">🔒 Switch roles in the sidebar to view this page.</div>`;
    } else {
      content.innerHTML = page.render(current.params);
      if (page.mount) page.mount(current.params);
    }
    wireShell();
    window.scrollTo(0, 0);
  }

  function wireShell() {
    const roleSel = document.getElementById("roleSelect");
    if (roleSel) roleSel.addEventListener("change", (e) => {
      State.role = e.target.value;
      if (!allowed(current.id)) {
        // jump to first allowed page
        const first = NAV.find((n) => allowed(n.id));
        if (first) { location.hash = first.route; return; }
      }
      renderCurrent();
    });
    const gs = document.getElementById("globalSearch");
    if (gs) gs.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        State.catalog.search = e.target.value;
        location.hash = "#/catalog";
      }
    });
  }

  window.App = { renderCurrent };
  window.addEventListener("hashchange", renderCurrent);
  window.addEventListener("DOMContentLoaded", () => {
    if (!location.hash) location.hash = "#/dashboard";
    renderCurrent();
  });
})();
