# Procurement Savings Portal

A centralized view of decentralized purchasing opportunities across products, SKUs, vendors, shops, and categories. The portal gives corporate procurement, regional operators, and individual shops a clean, menu-style view of SKUs, products, categories, pricing, and savings opportunities.

It is built to feel like an internal **procurement catalog and savings dashboard** — not a finance spreadsheet — so each shop can clearly see what they buy today, what procurement recommends, the old vs. new price, the savings available, and the action to take.

## Quick start

It's a dependency-free static front end. Open it directly or serve the folder:

```bash
# Option A: open the file
open index.html

# Option B: run a local server (recommended)
python3 -m http.server 8000
# then visit http://localhost:8000
```

No build step, no `npm install` — plain HTML/CSS/JS.

## Pages

| Page | What it does |
|------|--------------|
| **Dashboard** | Executive command center — baseline/negotiated/savings totals, savings by category & shop, top opportunities, shop adoption, implementation status. |
| **Categories** | Menu-style category → subcategory drill-down with spend, savings, recommended supplier, and review status per subcategory card. |
| **SKU Catalog** | Searchable, sortable, filterable SKU table (category, subcategory, shop, vendor, savings %, preferred/contracted flags, status) with CSV export. |
| **Savings Opportunities** | Opportunity register with roll-ups by category/subcategory/shop/brand/vendor/region/SKU, plus Quick Win / High Savings / Needs Review badges. |
| **Shop View** | Per-shop dashboard with Overview / Linens / Disposables / Supplies / Rentals / Action Items tabs. |
| **Vendors** | Vendor-level spend, savings, SKU counts, shop coverage, and current-vs-recommended comparison. |
| **Product Comparison** | Side-by-side current vs. recommended product with a "Recommended savings opportunity" callout. |
| **Implementation Tracker** | Adoption tracking across shops with owners, target/completion dates, blockers, and status. |
| **AI Categorization** | Live SKU auto-classification (category, subcategory, type, quality tier, normalization group) with a confidence score. |
| **Admin** | Upload/import/export CSV, add categories/subcategories/vendors, add/edit SKUs, manage flags & status. |

## Roles

Switch roles from the sidebar to see role-based access in action:

- **Procurement Admin** — view & edit everything
- **Category Manager** — all data, edits assigned categories
- **Regional Manager** — assigned region and shops
- **Shop Manager** — only shop-level data and action items
- **Executive** — dashboard, savings summary, implementation status

## Data model

Sample data ships in `js/data.js` — 20 linen SKUs, 20 disposable SKUs, 10 supply SKUs across 5 vendors, 5 shops, and 3 regions, with realistic old/new pricing.

Calculations are derived consistently:

```
Annual current spend = current unit price × annual quantity
Annual new spend     = new unit price × annual quantity
Annual savings       = current annual spend − new annual spend
Savings %            = annual savings ÷ current annual spend
```

Category, subcategory, shop, vendor, and region roll-ups are all computed from the SKU list.

### CSV upload template

The admin upload accepts CSV files with these columns:

```
SKU,Product Name,Description,Category,Subcategory,Shop,Region,Current Vendor,Recommended Vendor,Current Unit Price,New Unit Price,UOM,Pack Size,Annual Quantity,Quality Tier,Contracted Item,Preferred Item,Implementation Status,Notes
```

## Project structure

```
index.html          App shell (sidebar, topbar, content mount)
css/styles.css      Procurement palette + all component styles
js/data.js          Sample data models, calculations, AI categorizer, CSV utils
js/components.js     Reusable render helpers (badges, stat cards, tiles, bars)
js/pages.js          All page renderers + event wiring
js/app.js            Hash router, navigation, role-based access
```

## Design

Professional procurement palette: navy, white, light gray, soft green (savings), amber (review), red (risk), blue (informational). Left-side navigation, executive cards, category tiles, searchable tables, filter panels, savings/status badges, product cards, comparison panels, and shop/vendor dashboards.

> Built as a front-end mockup. Uploads and edits update the in-memory model for the current session and can be exported to CSV. The AI categorizer is a rule-based stand-in for future AI-powered classification.
