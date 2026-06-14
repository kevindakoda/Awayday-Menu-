/* =====================================================================
   Unit-of-measure engine. Converts between units within a dimension and
   normalizes pack/case pricing to a common base so items from different
   vendors/categories can be benchmarked apples-to-apples.
   Exposed on window.UOM.
   ===================================================================== */
(function () {
  "use strict";

  // factor = how many BASE units one of this unit equals.
  const DIMENSIONS = {
    count:  { label: "Count",  base: "each",
      units: { each: 1, unit: 1, piece: 1, pair: 2, "half-dozen": 6, dozen: 12, hundred: 100, gross: 144, ream: 500, thousand: 1000 } },
    weight: { label: "Weight", base: "oz",
      units: { mg: 0.000035274, g: 0.035274, oz: 1, lb: 16, kg: 35.274, ton: 32000 } },
    volume: { label: "Volume", base: "fl oz",
      units: { ml: 0.033814, "fl oz": 1, cup: 8, pt: 16, qt: 32, l: 33.814, gal: 128 } },
    length: { label: "Length", base: "ft",
      units: { mm: 0.0032808, cm: 0.032808, in: 0.083333, ft: 1, yd: 3, m: 3.28084 } },
    area:   { label: "Area",   base: "sq ft",
      units: { "sq in": 0.0069444, "sq ft": 1, "sq yd": 9, "sq cm": 0.0010764, "sq m": 10.7639 } },
    sheets: { label: "Sheets / Rolls", base: "sheet",
      units: { sheet: 1, roll: 1, ply: 1, ct: 1, sheets: 1, rolls: 1 } },
  };

  // Which dimension owns a given unit name (first match).
  function dimensionOf(unit) {
    const u = String(unit || "").toLowerCase().trim();
    for (const d in DIMENSIONS) if (DIMENSIONS[d].units[u] != null) return d;
    return null;
  }

  // Convert value from one unit to another within the same dimension.
  function convert(value, from, to) {
    const v = +value; if (!isFinite(v)) return null;
    const f = String(from || "").toLowerCase().trim(), t = String(to || "").toLowerCase().trim();
    const df = dimensionOf(f), dt = dimensionOf(t);
    if (!df || df !== dt) return null;
    const U = DIMENSIONS[df].units;
    return (v * U[f]) / U[t];
  }

  // Suggested base unit + dimension per merchandising category.
  const CATEGORY_BASIS = {
    Linens: { dimension: "count", base: "each", note: "Compare per piece (towel, sheet, pillow)." },
    Disposables: { dimension: "count", base: "each", note: "Compare per each / per 1,000 ct; rolls per sheet." },
    Supplies: { dimension: "count", base: "each", note: "Compare per each; chemicals per fl oz." },
    Technology: { dimension: "count", base: "unit", note: "Compare per device/unit." },
    Rentals: { dimension: "count", base: "each", note: "Compare per unit/month." },
    Other: { dimension: "count", base: "each", note: "Compare per each." },
  };

  // Pull a pack quantity out of a free-text pack / UoM string.
  // "12/cs", "case of 24", "30 ct", "pack of 6", "dozen", "2 ply", "(48)".
  function parsePackQty(str) {
    const s = String(str || "").toLowerCase();
    if (!s) return 1;
    if (/\bgross\b/.test(s)) return 144;
    if (/\bream\b/.test(s)) return 500;
    if (/\bdozen\b/.test(s)) return 12;
    // explicit "N per/each/case/pack/box/ct/count/roll/sheet"
    let m = s.match(/(\d[\d,]*)\s*(?:\/|per|x|ct|count|pk|pack|cs|case|bx|box|ea|each|rolls?|sheets?|units?)\b/);
    if (m) return Math.max(1, +m[1].replace(/,/g, ""));
    // "case of N", "pack of N"
    m = s.match(/(?:case|pack|box|set|bundle|carton)\s*of\s*(\d[\d,]*)/);
    if (m) return Math.max(1, +m[1].replace(/,/g, ""));
    // a bare number in parens "(48)" or leading "48 "
    m = s.match(/\((\d[\d,]*)\)/) || s.match(/^(\d[\d,]*)\b/);
    if (m) return Math.max(1, +m[1].replace(/,/g, ""));
    return 1;
  }

  // Price per single each, given a unit price and the pack descriptor it covers.
  function pricePerEach(price, packStr) {
    const p = +price; if (!isFinite(p)) return null;
    return p / parsePackQty(packStr);
  }

  function unitsForDimension(dim) {
    return DIMENSIONS[dim] ? Object.keys(DIMENSIONS[dim].units) : [];
  }

  window.UOM = {
    DIMENSIONS, CATEGORY_BASIS,
    dimensionOf, convert, parsePackQty, pricePerEach, unitsForDimension,
    dimensions: () => Object.keys(DIMENSIONS).map((k) => ({ key: k, label: DIMENSIONS[k].label, base: DIMENSIONS[k].base })),
  };
})();
