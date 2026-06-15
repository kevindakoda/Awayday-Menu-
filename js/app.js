/* =====================================================================
   App shell + hash router. Renders sidebar, topbar, and the active page.
   ===================================================================== */
(function () {
  "use strict";
  const P = window.PSP;
  const State = window.AppState;

  const NAV_GROUPS = [
    {
      section: "Brand View",
      items: [
        { id: "catalog", label: "SKU Catalog", icon: "📦", route: "#/catalog" },
        { id: "savings", label: "Savings Opportunities", icon: "📉", route: "#/savings" },
        { id: "shops", label: "Shop View", icon: "🏬", route: "#/shops" },
        { id: "patterns", label: "Buying Patterns", icon: "📅", route: "#/patterns" },
        { id: "comparison", label: "Product Comparison", icon: "🔄", route: "#/comparison" },
        { id: "ask", label: "Ask AI", icon: "💬", route: "#/ask" },
        { id: "intel", label: "Risk & Intelligence", icon: "📊", route: "#/intel" },
        { id: "market", label: "Market Insights", icon: "🌐", route: "#/market" },
      ],
    },
    {
      section: "Procurement View",
      items: [
        { id: "summary", label: "Executive Summary", icon: "⭐", route: "#/summary" },
        { id: "dashboard", label: "Dashboard", icon: "📊", route: "#/dashboard" },
        { id: "categories", label: "Categories", icon: "🗂️", route: "#/categories" },
        { id: "realization", label: "Savings Realization", icon: "🎯", route: "#/realization" },
        { id: "vendorspend", label: "Vendor Spend", icon: "🧾", route: "#/vendorspend" },
        { id: "compliance", label: "Price Compliance", icon: "⚖️", route: "#/compliance" },
        { id: "vendors", label: "Vendors", icon: "🏷️", route: "#/vendors" },
        { id: "uom", label: "UoM Converter", icon: "📐", route: "#/uom" },
        { id: "tracker", label: "Implementation Tracker", icon: "✅", route: "#/tracker" },
        { id: "quality", label: "Data Quality", icon: "🧹", route: "#/quality" },
        { id: "ai", label: "AI Categorization", icon: "🤖", route: "#/ai" },
        { id: "security", label: "Security & Access", icon: "🔐", route: "#/security" },
        { id: "admin", label: "Admin", icon: "⚙️", route: "#/admin" },
      ],
    },
  ];

  // page id -> permission key (some nav items map to same permission group)
  const PERM_KEY = { summary: "dashboard", dashboard: "dashboard", categories: "categories", catalog: "catalog", savings: "savings", realization: "savings", shops: "shops", patterns: "catalog", vendorspend: "savings", compliance: "savings", vendors: "vendors", comparison: "comparison", uom: "catalog", tracker: "tracker", ask: "catalog", intel: "savings", market: "dashboard", quality: "admin", ai: "admin", security: "security", admin: "admin" };

  // Page ids that belong to the Brand View group (derived from NAV_GROUPS).
  const BRAND_PAGES = new Set(
    (NAV_GROUPS.find((g) => g.section === "Brand View") || { items: [] }).items.map((n) => n.id)
  );

  function allowed(pageId) {
    const role = P.ROLES[State.role];
    if (!role) return false;
    // brandOnly roles can never reach the Procurement section.
    if (role.brandOnly && !BRAND_PAGES.has(pageId)) return false;
    if (role.pages === "*") return true;
    return role.pages.includes(PERM_KEY[pageId]);
  }

  // First page the current role is allowed to see (Brand View first), used as a
  // landing target so brand users never hit a "Restricted" wall on login.
  function firstAllowedPage() {
    for (const grp of NAV_GROUPS) {
      for (const n of grp.items) if (allowed(n.id)) return n.id;
    }
    return null;
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

  let navCollapsed = {};
  try { navCollapsed = JSON.parse(localStorage.getItem("psp_nav_collapsed") || "{}"); } catch (_) { /* ignore */ }

  function renderSidebar() {
    const groupHtml = NAV_GROUPS.map((grp) => {
      const items = grp.items.filter((n) => allowed(n.id));
      if (!items.length) return "";
      const hasActive = items.some((n) => n.id === current.id);
      // Both groups start rolled up; the group holding the active page opens,
      // and the user's explicit open/close choice is remembered.
      const stored = navCollapsed[grp.section];
      const open = hasActive || (stored != null ? !stored : false);
      const links = items.map((n) => {
        const isActive = n.id === current.id;
        return `<a href="${n.route}" class="${isActive ? "active" : ""}"><span class="ico">${n.icon}</span>${n.label}</a>`;
      }).join("");
      return `<button class="nav-section nav-toggle ${open ? "open" : ""}" data-section="${grp.section}">
          <span>${grp.section}</span><span class="nav-caret">${open ? "▾" : "▸"}</span></button>
        <div class="nav-group" ${open ? "" : 'style="display:none"'}>${links}</div>`;
    }).join("");

    const user = window.CURRENT_USER || { name: "—", email: "", role: State.role };
    const initials = (user.name || user.email || "U").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    return `
      <div class="brand">
        <div class="logo">📈</div>
        <div><div class="title">Savings Portal</div><div class="subtitle">Procurement Command Center</div></div>
      </div>
      <nav class="nav">
        ${groupHtml}
      </nav>
      <div class="role-box">
        <label>Signed in as</label>
        <div class="role-user"><span class="role-avatar">${initials}</span>
          <div><div class="role-name">${user.name || user.email}</div>
          <div class="role-desc" style="margin:0">${State.role}</div></div></div>
        <button id="logoutBtn" class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:10px">Sign out</button>
      </div>`;
  }

  function renderTopbar() {
    const page = window.PAGES[current.id];
    const totals = P.aggregate(P.SKUS);
    return `
      <div class="crumb">Procurement &nbsp;/&nbsp; <b>${page.crumb}</b></div>
      <div class="global-search"><span class="si">🔍</span><input type="text" id="globalSearch" placeholder="Search SKUs, vendors, categories…"></div>
      <div class="badge green" title="Total savings opportunity">▼ ${P.fmt.money(totals.savingsOpportunity)} savings</div>
      <div class="user-chip"><div class="avatar">${(window.CURRENT_USER && (window.CURRENT_USER.name || window.CURRENT_USER.email) || "U").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}</div></div>`;
  }

  function renderCurrent() {
    if (window.ShaderHero) window.ShaderHero.stop(); // halt any hero animation from the previous page
    current = parseHash();
    const page = window.PAGES[current.id];
    document.getElementById("sidebar").innerHTML = renderSidebar();
    document.getElementById("topbar").innerHTML = renderTopbar();

    const content = document.getElementById("content");
    // Brand user with no shop/region assigned yet: nothing is scoped to them,
    // so explain it rather than showing empty tables everywhere.
    const role = P.ROLES[State.role];
    const u = window.CURRENT_USER || {};
    if (role && role.brandOnly && !u.shop && !u.region) {
      content.innerHTML = `<div class="page-head"><h1>Welcome${u.name ? ", " + u.name.split(" ")[0] : ""} 👋</h1>
          <p>Your account isn't linked to a shop yet.</p></div>
        <div class="empty" style="max-width:560px;margin:0 auto;text-align:center;line-height:1.6">
          🏬 <b>No shop assigned</b><br>
          Your portal access is approved, but a portal admin still needs to assign your shop before your data appears.
          <div style="margin-top:10px">Please contact your procurement admin and ask them to set your shop on the Security &amp; Access page.</div>
        </div>`;
      wireShell();
      window.scrollTo(0, 0);
      return;
    }
    if (!allowed(current.id)) {
      // Redirect to the first page this role can see rather than show a wall.
      const dest = firstAllowedPage();
      if (dest && dest !== current.id) { location.hash = "#/" + dest; return; }
      content.innerHTML = `<div class="page-head"><h1>Restricted</h1><p>The <b>${State.role}</b> role does not have access to ${page.crumb}.</p></div>
        <div class="empty">🔒 Contact your portal admin if you believe you should have access.</div>`;
    } else {
      content.innerHTML = page.render(current.params);
      if (page.mount) page.mount(current.params);
    }
    wireShell();
    window.scrollTo(0, 0);
  }

  function wireShell() {
    const logout = document.getElementById("logoutBtn");
    if (logout) logout.addEventListener("click", () => {
      if (window.Auth && window.Auth.logout) window.Auth.logout();
    });
    const gs = document.getElementById("globalSearch");
    if (gs) gs.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        State.catalog.search = e.target.value;
        location.hash = "#/catalog";
      }
    });
    document.querySelectorAll(".nav-toggle").forEach((h) => h.addEventListener("click", () => {
      const s = h.getAttribute("data-section");
      // If the section is currently open, we're collapsing it (store true = collapsed).
      navCollapsed[s] = h.classList.contains("open");
      try { localStorage.setItem("psp_nav_collapsed", JSON.stringify(navCollapsed)); } catch (_) { /* ignore */ }
      const sb = document.getElementById("sidebar");
      if (sb) { sb.innerHTML = renderSidebar(); wireShell(); }
    }));
  }

  // Decide a brand user's data scope from their role + assigned shop/region.
  // Full-access roles (Procurement Admin, Category Manager) get no scope.
  function computeScope(role, shop, region) {
    const r = P.ROLES[role];
    if (!r || r.pages === "*" || !r.brandOnly) return null;
    if (role === "Regional Manager" && region) return { type: "region", region };
    if (shop) return { type: "shop", shop, shopCode: shop };
    if (region) return { type: "region", region };
    return null;
  }

  // The app only renders once auth.js confirms a session and calls start().
  let started = false;
  async function start() {
    started = true;
    const u = window.CURRENT_USER || {};
    if (P.setScope) P.setScope(computeScope(State.role, u.shop, u.region));
    // Procurement/full-access users land on the Executive Summary (hero) home;
    // brand users land on their first allowed Brand View page.
    if (!location.hash) {
      const r = P.ROLES[State.role];
      const home = (r && !r.brandOnly) ? "summary" : (firstAllowedPage() || "catalog");
      location.hash = "#/" + home;
    }
    // Hydrate the in-memory model from Supabase before the first render so
    // previously uploaded/edited data is present. Falls back to in-memory.
    if (window.Store && window.Store.available && window.Store.available()) {
      const content = document.getElementById("content");
      if (content) content.innerHTML = `<div class="empty" style="padding:60px;text-align:center">⏳ Loading procurement data…</div>`;
      try { await window.Store.loadAll(); } catch (e) { console.error("Data load failed:", e); }
    }
    renderCurrent();
  }

  window.App = { renderCurrent, start };
  window.addEventListener("hashchange", () => { if (started) renderCurrent(); });
})();
