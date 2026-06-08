/* =====================================================================
   Reusable UI components (render-to-HTML-string helpers)
   Exposed on window.UI
   ===================================================================== */
(function () {
  "use strict";
  const { fmt } = window.PSP;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  /* ------------------------------- Badges ------------------------------- */
  const STATUS_STYLES = {
    "Not Reviewed": "gray", "Not started": "gray",
    "In Review": "amber", "In review": "amber",
    Approved: "blue",
    "Vendor transition started": "purple",
    Implemented: "green",
    Deferred: "gray",
    Rejected: "red",
    "Pending Local Review": "amber",
  };
  function statusBadge(status) {
    const cls = STATUS_STYLES[status] || "gray";
    return `<span class="badge ${cls}"><span class="dot"></span>${esc(status)}</span>`;
  }

  const OPP_BADGE_STYLES = {
    "Quick Win": "green", "High Savings": "green", "Needs Review": "amber",
    "Local Preference": "blue", "Contract Required": "purple", Implemented: "green",
  };
  function oppBadge(label) {
    return `<span class="badge ${OPP_BADGE_STYLES[label] || "gray"}">${esc(label)}</span>`;
  }

  function savingsBadge(pct) {
    const cls = pct >= 25 ? "green" : pct >= 15 ? "blue" : pct >= 0 ? "amber" : "red";
    const sign = pct >= 0 ? "▼ " : "▲ ";
    return `<span class="badge ${cls} savings-badge">${sign}${fmt.pct(Math.abs(pct))}</span>`;
  }

  function riskBadge(risk) {
    const cls = risk === "High" ? "red" : risk === "Medium" ? "amber" : "green";
    return `<span class="badge ${cls}">${esc(risk)} risk</span>`;
  }

  function easeBadge(ease) {
    const cls = ease === "Easy" ? "green" : ease === "Moderate" ? "amber" : "gray";
    return `<span class="badge ${cls}">${esc(ease)}</span>`;
  }

  function confidenceBadge(conf) {
    const map = { "High Confidence": "green", "Medium Confidence": "amber", "Low Confidence": "red", "Needs Manual Review": "gray" };
    return `<span class="badge ${map[conf] || "gray"}">${esc(conf)}</span>`;
  }

  /* ------------------------------- Stat card ------------------------------- */
  function statCard({ label, value, delta, accent, icon, iconBg, deltaClass }) {
    return `<div class="stat ${accent ? "accent-" + accent : ""}">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${delta ? `<div class="delta ${deltaClass || "text-green"}">${delta}</div>` : ""}
      ${icon ? `<div class="ico-bubble" style="background:${iconBg || "var(--navy-50)"}">${icon}</div>` : ""}
    </div>`;
  }

  /* ------------------------------ Category tile ------------------------------ */
  function categoryTile(c) {
    return `<a class="cat-tile" href="#/categories/${encodeURIComponent(c.categoryName)}">
      <div class="tile-head" style="background:${c.color}">
        <span class="ic">${c.icon}</span><span class="nm">${esc(c.categoryName)}</span>
      </div>
      <div class="tile-body">
        <div class="tile-metric"><span class="k">Baseline spend</span><span class="v">${fmt.money(c.baselineSpend)}</span></div>
        <div class="tile-metric"><span class="k">New negotiated</span><span class="v">${fmt.money(c.newSpend)}</span></div>
        <div class="tile-metric"><span class="k">Savings</span><span class="v text-green">${fmt.money(c.savingsOpportunity)}</span></div>
        <div class="tile-metric"><span class="k">SKUs</span><span class="v">${c.skuCount}</span></div>
        <div class="tile-metric"><span class="k">Top vendor</span><span class="v">${esc(c.topVendors[0] || "—")}</span></div>
        <div class="tile-foot">
          ${savingsBadge(c.savingsPercentage)}
          ${statusBadge(c.status)}
        </div>
      </div>
    </a>`;
  }

  /* ------------------------------ Bar (h) ------------------------------ */
  function hbar(label, value, max, display) {
    const pct = max ? Math.max(2, (value / max) * 100) : 0;
    return `<div class="bar-row">
      <div class="bl">${esc(label)}</div>
      <div class="hbar"><span style="width:${pct}%"></span></div>
      <div class="bv">${display}</div>
    </div>`;
  }

  /* ------------------------------ Progress ------------------------------ */
  function progress(pct) {
    return `<div class="progress"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>`;
  }

  function confidenceMeter(score) {
    const color = score >= 0.85 ? "var(--green)" : score >= 0.7 ? "var(--amber)" : score >= 0.5 ? "var(--red)" : "var(--gray-400)";
    return `<div class="confidence-meter"><span style="width:${Math.round(score * 100)}%;background:${color}"></span></div>`;
  }

  window.UI = {
    esc, statusBadge, oppBadge, savingsBadge, riskBadge, easeBadge, confidenceBadge,
    statCard, categoryTile, hbar, progress, confidenceMeter,
  };
})();
