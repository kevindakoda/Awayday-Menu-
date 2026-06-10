/* =====================================================================
   Procurement Savings Portal - Data Layer
   - Sample data models (SKUs, categories, subcategories, vendors, shops)
   - Derived calculations (spend, savings, percentages, roll-ups)
   All data lives on window.PSP so non-module scripts can share it.
   ===================================================================== */
(function () {
  "use strict";

  const round = (n, d = 2) => {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  };

  /* ---------------------------- Reference data ---------------------------- */
  const REGIONS = ["Southeast", "Northeast", "West"];

  // Brands (properties) start empty — populate via Admin → Excel upload,
  // image/PDF OCR, manual add, or the optional "Load sample data" button.
  // SAMPLE_SHOPS backs the bundled demo dataset.
  const SHOPS = [];
  const SAMPLE_SHOPS = [
    { shopName: "Harbor View Resort", code: "Shop A", region: "Southeast" },
    { shopName: "Magnolia Suites", code: "Shop B", region: "Southeast" },
    { shopName: "Beacon Hill Inn", code: "Shop C", region: "Northeast" },
    { shopName: "Cascade Lodge", code: "Shop D", region: "West" },
    { shopName: "Liberty Plaza Hotel", code: "Shop E", region: "Northeast" },
  ];

  const VENDORS = [
    {
      vendorName: "Calderon Textiles",
      categories: ["Linens"],
      contractStatus: "National Contract",
      pricingStatus: "Negotiated",
      notes: "Preferred national linen vendor with standardized quality tiers.",
    },
    {
      vendorName: "A1 American",
      categories: ["Linens", "Disposables"],
      contractStatus: "National Contract",
      pricingStatus: "Negotiated",
      notes: "Broad catalog, strong logistics across all regions.",
    },
    {
      vendorName: "National Hospitality Supply",
      categories: ["Disposables", "Supplies"],
      contractStatus: "In Negotiation",
      pricingStatus: "Proposed",
      notes: "Competitive disposables pricing pending final contract.",
    },
    {
      vendorName: "Guardian Janitorial",
      categories: ["Supplies", "Disposables"],
      contractStatus: "Preferred",
      pricingStatus: "Negotiated",
      notes: "Janitorial and cleaning supplies specialist.",
    },
    {
      vendorName: "Summit Office & Tech",
      categories: ["Supplies"],
      contractStatus: "Preferred",
      pricingStatus: "Negotiated",
      notes: "Office, technology, and back-of-house supplies.",
    },
    {
      vendorName: "Guardian Security Systems",
      categories: ["Locks"],
      contractStatus: "National Contract",
      pricingStatus: "Negotiated",
      notes: "Electronic locks, safes, and door hardware with standardized keying.",
    },
  ];

  const STATUSES = [
    "Not Reviewed",
    "In Review",
    "Approved",
    "Implemented",
    "Deferred",
    "Rejected",
  ];

  /* ----------------------------- SKU seed data ----------------------------- */
  // Each row: name, desc, subcategory, current vendor, recommended vendor,
  // current price, new price, uom, pack, annual qty, quality tier, shop index,
  // contracted, preferred, status. Spend & savings are computed below.
  const linenSeed = [
    ["White Bath Towel 27x54", "Standard white cotton bath towel", "Towels", "Current Local Vendor", "Calderon Textiles", 4.25, 3.15, "Each", "12 pack", 10000, "Standard", 0, true, true, "In Review"],
    ["Luxury Bath Sheet 35x70", "Premium combed cotton bath sheet", "Towels", "Current Local Vendor", "Calderon Textiles", 9.8, 7.6, "Each", "6 pack", 4200, "Luxury", 2, true, true, "Approved"],
    ["Hand Towel 16x27", "White ringspun hand towel", "Towels", "Regional Linen Co", "Calderon Textiles", 1.65, 1.18, "Each", "24 pack", 18000, "Standard", 1, true, false, "In Review"],
    ["Washcloth 13x13", "Economy white washcloth", "Towels", "Regional Linen Co", "A1 American", 0.55, 0.39, "Each", "48 pack", 30000, "Economy", 3, false, false, "Not Reviewed"],
    ["Pool Towel Blue Stripe", "Heavy pool towel with blue stripe", "Pool Towels", "Current Local Vendor", "Calderon Textiles", 6.4, 4.95, "Each", "12 pack", 5200, "Standard", 0, true, true, "Approved"],
    ["Flat Sheet Queen", "T-200 white flat sheet, queen", "Sheets", "Regional Linen Co", "Calderon Textiles", 7.2, 5.45, "Each", "12 pack", 6400, "Standard", 4, true, true, "Implemented"],
    ["Fitted Sheet Queen", "T-200 white fitted sheet, queen", "Sheets", "Regional Linen Co", "Calderon Textiles", 7.6, 5.7, "Each", "12 pack", 6400, "Standard", 4, true, true, "Implemented"],
    ["Fitted Sheet King", "T-250 white fitted sheet, king", "Sheets", "Current Local Vendor", "Calderon Textiles", 9.1, 7.05, "Each", "12 pack", 3800, "Standard", 2, true, false, "In Review"],
    ["Luxury Sateen Sheet Set King", "300TC sateen sheet set", "Sheets", "Boutique Linens", "Calderon Textiles", 34.0, 27.5, "Set", "1 set", 900, "Luxury", 2, true, true, "Approved"],
    ["Pillowcase Standard", "T-200 white pillowcase", "Pillowcases", "Regional Linen Co", "Calderon Textiles", 1.95, 1.42, "Each", "24 pack", 14000, "Standard", 1, true, false, "Not Reviewed"],
    ["Pillowcase King", "T-200 white king pillowcase", "Pillowcases", "Regional Linen Co", "Calderon Textiles", 2.25, 1.66, "Each", "24 pack", 7000, "Standard", 1, false, false, "Not Reviewed"],
    ["Bath Mat 20x30", "White cotton bath mat", "Bath Mats", "Current Local Vendor", "Calderon Textiles", 3.4, 2.55, "Each", "12 pack", 5600, "Standard", 0, true, false, "In Review"],
    ["Waffle Bath Mat", "Premium waffle weave bath mat", "Bath Mats", "Boutique Linens", "Calderon Textiles", 5.2, 4.1, "Each", "6 pack", 1800, "Luxury", 3, true, true, "Approved"],
    ["Blanket Twin Thermal", "Cellular thermal blanket, twin", "Blankets", "Regional Linen Co", "A1 American", 8.75, 6.6, "Each", "6 pack", 2400, "Standard", 4, false, false, "In Review"],
    ["Blanket King Fleece", "Plush fleece blanket, king", "Blankets", "Boutique Linens", "A1 American", 14.5, 11.2, "Each", "4 pack", 1500, "Luxury", 2, true, true, "Approved"],
    ["Duvet Insert Queen", "Down-alternative duvet insert", "Duvets", "Boutique Linens", "Calderon Textiles", 22.0, 17.4, "Each", "2 pack", 1200, "Luxury", 0, true, true, "In Review"],
    ["Duvet Cover White Queen", "White microfiber duvet cover", "Duvets", "Regional Linen Co", "Calderon Textiles", 18.5, 14.2, "Each", "4 pack", 1600, "Standard", 1, true, false, "Not Reviewed"],
    ["Mattress Pad Queen", "Quilted fitted mattress pad, queen", "Mattress Pads", "Current Local Vendor", "Calderon Textiles", 12.4, 9.5, "Each", "6 pack", 2100, "Standard", 3, true, true, "Approved"],
    ["Mattress Encasement King", "Zippered waterproof encasement", "Mattress Pads", "Current Local Vendor", "Calderon Textiles", 16.8, 13.1, "Each", "4 pack", 1300, "Standard", 4, true, false, "In Review"],
    ["Kitchen Towel Terry", "16x19 cotton terry kitchen towel", "Kitchen Towels", "Regional Linen Co", "A1 American", 0.95, 0.68, "Each", "60 pack", 22000, "Economy", 1, false, false, "Not Reviewed"],
  ];

  const disposableSeed = [
    ["Paper Towel Roll 2-Ply", "85 sheet 2-ply paper towel roll", "Paper Towels", "Current Local Vendor", "A1 American", 1.35, 0.98, "Roll", "30 pack", 26000, "Standard", 0, true, true, "Approved"],
    ["Multifold Hand Towel", "White multifold hand towel", "Paper Towels", "National Hospitality Supply", "A1 American", 28.5, 21.4, "Case", "4000/case", 1400, "Standard", 1, true, false, "In Review"],
    ["Toilet Paper 2-Ply", "2-ply toilet tissue, 500 sheet", "Toilet Paper", "Current Local Vendor", "A1 American", 0.62, 0.44, "Roll", "96 pack", 48000, "Standard", 2, true, true, "Approved"],
    ["Jumbo Roll Tissue", "Jumbo junior 2-ply tissue", "Toilet Paper", "National Hospitality Supply", "A1 American", 1.85, 1.32, "Roll", "12 pack", 16000, "Standard", 3, true, false, "In Review"],
    ["Trash Bag 55 Gallon Black", "Black 55 gal 1.5 mil can liner", "Trash Bags", "National Hospitality Supply", "Guardian Janitorial", 0.42, 0.29, "Each", "100 pack", 60000, "Standard", 4, true, true, "Approved"],
    ["Trash Bag 13 Gallon White", "White 13 gal kitchen liner", "Trash Bags", "Current Local Vendor", "Guardian Janitorial", 0.16, 0.11, "Each", "200 pack", 90000, "Economy", 0, true, false, "In Review"],
    ["Trash Bag 33 Gallon", "Black 33 gal heavy duty liner", "Trash Bags", "National Hospitality Supply", "Guardian Janitorial", 0.31, 0.21, "Each", "150 pack", 42000, "Standard", 1, true, false, "Not Reviewed"],
    ["Laundry Bag Nylon", "Mesh nylon laundry bag", "Laundry Bags", "Boutique Linens", "A1 American", 2.8, 2.05, "Each", "12 pack", 3200, "Standard", 2, false, false, "Not Reviewed"],
    ["Soiled Linen Bag", "Dissolvable soiled linen bag", "Laundry Bags", "National Hospitality Supply", "A1 American", 0.34, 0.24, "Each", "100 pack", 18000, "Standard", 3, true, false, "In Review"],
    ["Nitrile Gloves Medium", "Powder-free nitrile glove, medium", "Gloves", "Guardian Janitorial", "Guardian Janitorial", 9.5, 7.1, "Box", "100/box", 5200, "Standard", 0, true, true, "Approved"],
    ["Nitrile Gloves Large", "Powder-free nitrile glove, large", "Gloves", "Guardian Janitorial", "Guardian Janitorial", 9.5, 7.1, "Box", "100/box", 4800, "Standard", 1, true, true, "Approved"],
    ["Vinyl Gloves Multi", "General purpose vinyl glove", "Gloves", "National Hospitality Supply", "Guardian Janitorial", 6.2, 4.4, "Box", "100/box", 3600, "Economy", 4, false, false, "Not Reviewed"],
    ["Paper Cup 8oz", "White paper hot cup 8oz", "Cups", "National Hospitality Supply", "A1 American", 0.07, 0.05, "Each", "1000 pack", 120000, "Standard", 2, true, true, "Implemented"],
    ["Plastic Cup 16oz", "Clear PET cold cup 16oz", "Cups", "Current Local Vendor", "A1 American", 0.11, 0.08, "Each", "1000 pack", 70000, "Standard", 3, true, false, "In Review"],
    ["Paper Plate 9in", "White uncoated paper plate", "Plates", "National Hospitality Supply", "A1 American", 0.06, 0.043, "Each", "1000 pack", 65000, "Economy", 0, false, false, "Not Reviewed"],
    ["Cutlery Kit", "Wrapped fork/knife/napkin kit", "Utensils", "National Hospitality Supply", "A1 American", 0.14, 0.1, "Each", "500 pack", 40000, "Standard", 1, true, false, "In Review"],
    ["Dinner Napkin White", "1-ply white dinner napkin", "Napkins", "Current Local Vendor", "A1 American", 0.018, 0.012, "Each", "6000 pack", 240000, "Economy", 4, true, true, "Approved"],
    ["Cocktail Napkin", "Beverage cocktail napkin", "Napkins", "National Hospitality Supply", "A1 American", 0.022, 0.016, "Each", "4000 pack", 110000, "Standard", 2, false, false, "Not Reviewed"],
    ["Coffee Filter 12-Cup", "Commercial coffee filter", "Coffee Filters", "National Hospitality Supply", "A1 American", 0.04, 0.028, "Each", "1000 pack", 52000, "Standard", 3, true, false, "In Review"],
    ["Coffee Filter Urn", "Large urn coffee filter", "Coffee Filters", "National Hospitality Supply", "A1 American", 0.12, 0.085, "Each", "500 pack", 14000, "Standard", 0, false, false, "Not Reviewed"],
  ];

  const supplySeed = [
    ["All-Purpose Cleaner", "Concentrate all-purpose cleaner", "Cleaning Supplies", "Guardian Janitorial", "Guardian Janitorial", 6.8, 5.1, "Gallon", "4/case", 3200, "Standard", 0, true, true, "Approved"],
    ["Glass Cleaner", "Ammonia-free glass cleaner", "Cleaning Supplies", "Current Local Vendor", "Guardian Janitorial", 4.2, 3.05, "Quart", "12/case", 2600, "Standard", 1, true, false, "In Review"],
    ["Disinfectant Wipes", "Hospital-grade disinfectant wipes", "Cleaning Supplies", "National Hospitality Supply", "Guardian Janitorial", 5.6, 4.2, "Canister", "6/case", 4100, "Standard", 2, true, true, "Approved"],
    ["Floor Finish", "High-solids floor finish", "Cleaning Supplies", "Guardian Janitorial", "Guardian Janitorial", 28.0, 22.5, "Gallon", "4/case", 800, "Standard", 3, false, false, "Not Reviewed"],
    ["Microfiber Cloth Pack", "16x16 microfiber cleaning cloth", "Cleaning Supplies", "Current Local Vendor", "Guardian Janitorial", 0.85, 0.6, "Each", "50 pack", 9000, "Standard", 4, true, false, "In Review"],
    ["Copy Paper 8.5x11", "92-bright multipurpose copy paper", "Office Supplies", "Current Local Vendor", "Summit Office & Tech", 4.95, 3.85, "Ream", "10/case", 2200, "Standard", 0, true, false, "In Review"],
    ["Ballpoint Pen Box", "Medium point black pen", "Office Supplies", "Current Local Vendor", "Summit Office & Tech", 3.2, 2.25, "Box", "12/box", 1400, "Economy", 1, false, false, "Not Reviewed"],
  ];

  const locksSeed = [
    ["RFID Door Lock", "Battery RFID guest room door lock", "Door Locks", "Current Local Vendor", "Guardian Security Systems", 185.0, 142.0, "Each", "1 each", 1200, "Standard", 0, true, true, "In Review"],
    ["Mobile Key Lock Upgrade", "BLE mobile-key compatible lock", "Door Locks", "Current Local Vendor", "Guardian Security Systems", 240.0, 198.0, "Each", "1 each", 600, "Luxury", 2, true, true, "Approved"],
    ["RFID Key Card", "Reprogrammable RFID guest key card", "Key Cards", "Current Local Vendor", "Summit Office & Tech", 0.22, 0.15, "Each", "500 pack", 30000, "Standard", 3, true, true, "Approved"],
    ["Wristband Key Fob", "Waterproof RFID pool/spa wristband", "Key Cards", "Current Local Vendor", "Summit Office & Tech", 0.95, 0.68, "Each", "200 pack", 9000, "Standard", 0, false, false, "Not Reviewed"],
    ["Electronic Safe In-Room", "Digital in-room guest safe", "Safes", "Current Local Vendor", "Guardian Security Systems", 95.0, 74.0, "Each", "1 each", 800, "Standard", 1, true, false, "In Review"],
    ["Deadbolt Cylinder", "Commercial-grade deadbolt cylinder", "Door Hardware", "Current Local Vendor", "Guardian Security Systems", 28.0, 21.5, "Each", "10 pack", 1600, "Standard", 4, false, false, "Not Reviewed"],
    ["Master Key System Cylinder", "Keyed-alike back-of-house cylinder", "Door Hardware", "Current Local Vendor", "Guardian Security Systems", 34.0, 26.0, "Each", "10 pack", 1100, "Standard", 2, true, false, "In Review"],
    ["Padlock Keyed-Alike", "Weatherproof keyed-alike padlock", "Padlocks", "Current Local Vendor", "Guardian Security Systems", 12.5, 9.2, "Each", "12 pack", 2400, "Economy", 3, false, false, "Not Reviewed"],
    ["Smart Lock Battery Pack", "Replacement lock battery pack", "Lock Accessories", "Current Local Vendor", "Guardian Security Systems", 6.4, 4.6, "Each", "50 pack", 5200, "Standard", 0, true, true, "Approved"],
    ["Door Closer Hydraulic", "ADA hydraulic door closer", "Door Hardware", "Current Local Vendor", "Guardian Security Systems", 48.0, 37.5, "Each", "6 pack", 900, "Standard", 1, true, false, "In Review"],
  ];

  const technologySeed = [
    ["Smart TV 50in", "50-inch hospitality smart TV", "Guest Room Tech", "Current Local Vendor", "Summit Office & Tech", 410.0, 318.0, "Each", "1 each", 850, "Standard", 0, true, true, "In Review"],
    ["Streaming Casting Device", "Pro casting/streaming device", "Guest Room Tech", "Current Local Vendor", "Summit Office & Tech", 95.0, 71.0, "Each", "1 each", 850, "Standard", 2, true, true, "Approved"],
    ["Smart Thermostat", "Occupancy-aware smart thermostat", "Guest Room Tech", "Current Local Vendor", "Summit Office & Tech", 130.0, 99.0, "Each", "1 each", 1100, "Standard", 1, true, true, "In Review"],
    ["WiFi Access Point", "WiFi 6 in-room access point", "Networking", "Current Local Vendor", "Summit Office & Tech", 145.0, 112.0, "Each", "1 each", 700, "Standard", 3, true, false, "In Review"],
    ["Network Switch 24-Port", "Managed 24-port PoE switch", "Networking", "Current Local Vendor", "Summit Office & Tech", 520.0, 415.0, "Each", "1 each", 90, "Standard", 4, true, false, "Not Reviewed"],
    ["Tablet In-Room Control", "10-inch in-room control tablet", "Guest Room Tech", "Current Local Vendor", "Summit Office & Tech", 220.0, 168.0, "Each", "1 each", 600, "Luxury", 2, true, true, "Approved"],
    ["POS Terminal", "Front-desk POS terminal", "Front Desk Tech", "Current Local Vendor", "Summit Office & Tech", 680.0, 540.0, "Each", "1 each", 70, "Standard", 0, true, false, "In Review"],
    ["Thermal Receipt Roll", "Thermal POS receipt roll", "Front Desk Tech", "Current Local Vendor", "Summit Office & Tech", 0.65, 0.46, "Roll", "50 pack", 12000, "Standard", 2, true, true, "Approved"],
    ["HDMI Cable 6ft", "6ft HDMI cable for guest TVs", "Cabling & Accessories", "Current Local Vendor", "Summit Office & Tech", 5.5, 3.95, "Each", "10 pack", 900, "Standard", 4, false, false, "Not Reviewed"],
    ["USB-C Charging Hub", "Bedside USB-C charging hub", "Cabling & Accessories", "Current Local Vendor", "Summit Office & Tech", 14.5, 10.8, "Each", "20 pack", 4200, "Standard", 1, true, false, "In Review"],
  ];

  const otherSeed = [
    ["Shampoo 1 oz Bottle", "Guest amenity shampoo, 1 oz", "Guest Amenities", "Current Local Vendor", "A1 American", 0.28, 0.19, "Each", "300 pack", 90000, "Standard", 0, true, true, "Approved"],
    ["Conditioner 1 oz Bottle", "Guest amenity conditioner, 1 oz", "Guest Amenities", "Current Local Vendor", "A1 American", 0.28, 0.19, "Each", "300 pack", 78000, "Standard", 1, true, true, "Approved"],
    ["Bar Soap 1.5 oz", "Wrapped guest bar soap, 1.5 oz", "Guest Amenities", "Current Local Vendor", "A1 American", 0.16, 0.11, "Each", "500 pack", 96000, "Economy", 2, true, false, "In Review"],
    ["Body Lotion 1 oz", "Guest amenity body lotion, 1 oz", "Guest Amenities", "Current Local Vendor", "A1 American", 0.3, 0.21, "Each", "300 pack", 52000, "Standard", 3, false, false, "Not Reviewed"],
    ["Single-Serve Coffee Pod", "Regular roast single-serve pod", "Food & Beverage", "Current Local Vendor", "National Hospitality Supply", 0.32, 0.24, "Each", "200 pack", 140000, "Standard", 4, true, true, "Approved"],
    ["Bottled Water 16.9 oz", "In-room bottled spring water", "Food & Beverage", "Current Local Vendor", "National Hospitality Supply", 0.42, 0.31, "Each", "24 pack", 60000, "Standard", 0, true, false, "In Review"],
    ["Sugar/Sweetener Packet", "Assorted sweetener packet caddy", "Food & Beverage", "Current Local Vendor", "National Hospitality Supply", 0.015, 0.011, "Each", "2000 pack", 220000, "Economy", 1, false, false, "Not Reviewed"],
    ["Laundry Detergent Bulk", "Commercial bulk laundry detergent", "Maintenance & MRO", "Current Local Vendor", "Guardian Janitorial", 34.0, 26.5, "Pail", "1 pail", 600, "Standard", 2, true, true, "Approved"],
    ["HVAC Filter 20x25", "Pleated MERV-8 HVAC filter", "Maintenance & MRO", "Current Local Vendor", "Guardian Janitorial", 4.2, 3.1, "Each", "12 pack", 7800, "Standard", 3, true, false, "In Review"],
    ["LED Bulb A19", "9W LED A19 bulb, warm white", "Maintenance & MRO", "Current Local Vendor", "Summit Office & Tech", 1.85, 1.32, "Each", "24 pack", 18000, "Standard", 4, true, true, "Approved"],
  ];

  function buildSkus() {
    const all = [];
    let counter = 1;
    const add = (seed, category) => {
      seed.forEach((r) => {
        const [name, desc, sub, cv, rv, cp, np, uom, pack, qty, tier, shopIdx, contracted, preferred, status] = r;
        const shop = SAMPLE_SHOPS[shopIdx];
        const currentAnnualSpend = round(cp * qty);
        const newAnnualSpend = round(np * qty);
        const annualSavings = round(currentAnnualSpend - newAnnualSpend);
        const savingsPercentage = round((annualSavings / currentAnnualSpend) * 100, 1);
        all.push({
          id: "SKU-" + String(counter++).padStart(3, "0"),
          productName: name,
          description: desc,
          category: category,
          subcategory: sub,
          currentVendor: cv,
          recommendedVendor: rv,
          currentUnitPrice: cp,
          newUnitPrice: np,
          unitOfMeasure: uom,
          packSize: pack,
          annualQuantity: qty,
          currentAnnualSpend,
          newAnnualSpend,
          annualSavings,
          savingsPercentage,
          shop: shop.shopName,
          shopCode: shop.code,
          region: shop.region,
          qualityTier: tier,
          implementationStatus: status,
          preferredItem: preferred,
          contractedItem: contracted,
          imageUrl: "",
          notes: "Recommended replacement based on negotiated national pricing.",
        });
      });
    };
    add(linenSeed, "Linens");
    add(disposableSeed, "Disposables");
    add(supplySeed, "Supplies");
    add(locksSeed, "Locks");
    add(technologySeed, "Technology");
    add(otherSeed, "Other");
    return all;
  }

  // Catalog starts empty; populated via uploads/OCR or loadSampleData().
  const SKUS = [];

  /* ------------------------- Subcategory definitions ------------------------- */
  const SUBCATEGORIES = {
    Linens: ["Sheets", "Pillowcases", "Towels", "Bath Mats", "Blankets", "Duvets", "Mattress Pads", "Pool Towels", "Kitchen Towels", "Luxury Linen Items", "Standard Linen Items", "Economy Linen Items"],
    Disposables: ["Paper Towels", "Toilet Paper", "Trash Bags", "Laundry Bags", "Gloves", "Cups", "Plates", "Utensils", "Napkins", "Coffee Filters", "Cleaning Disposables", "Guest Consumables"],
    Supplies: ["Cleaning Supplies", "Office Supplies", "Maintenance", "Janitorial"],
    Locks: ["Door Locks", "Key Cards", "Safes", "Door Hardware", "Padlocks", "Lock Accessories"],
    Technology: ["Guest Room Tech", "Networking", "Front Desk Tech", "Cabling & Accessories"],
    Rentals: ["Event Linens", "Furniture", "Equipment", "Tableware"],
    Other: ["Guest Amenities", "Food & Beverage", "Maintenance & MRO", "Miscellaneous"],
  };

  // Display order for category tiles, dropdowns, and roll-ups.
  const CATEGORY_ORDER = ["Linens", "Disposables", "Supplies", "Locks", "Technology", "Rentals", "Other"];

  const CATEGORY_META = {
    Linens: { icon: "🛏️", color: "#1e3a5f" },
    Disposables: { icon: "🧻", color: "#2563eb" },
    Supplies: { icon: "🧴", color: "#0d9488" },
    Locks: { icon: "🔐", color: "#b45309" },
    Technology: { icon: "💻", color: "#0369a1" },
    Rentals: { icon: "📦", color: "#7c3aed" },
    Other: { icon: "✨", color: "#d97706" },
  };

  /* ---------------------------- Roll-up helpers ---------------------------- */
  function aggregate(rows) {
    const baseline = round(rows.reduce((s, r) => s + r.currentAnnualSpend, 0));
    const negotiated = round(rows.reduce((s, r) => s + r.newAnnualSpend, 0));
    const savings = round(baseline - negotiated);
    const pct = baseline ? round((savings / baseline) * 100, 1) : 0;
    return { baselineSpend: baseline, newSpend: negotiated, savingsOpportunity: savings, savingsPercentage: pct, skuCount: rows.length };
  }

  function topVendor(rows) {
    const tally = {};
    rows.forEach((r) => {
      tally[r.recommendedVendor] = (tally[r.recommendedVendor] || 0) + r.annualSavings;
    });
    let best = "—", bestVal = -1;
    Object.keys(tally).forEach((v) => {
      if (tally[v] > bestVal) { bestVal = tally[v]; best = v; }
    });
    return best;
  }

  // Roll a status for a group by most common
  function groupStatus(rows) {
    const tally = {};
    rows.forEach((r) => { tally[r.implementationStatus] = (tally[r.implementationStatus] || 0) + 1; });
    let best = "Not Reviewed", bestVal = -1;
    Object.keys(tally).forEach((s) => { if (tally[s] > bestVal) { bestVal = tally[s]; best = s; } });
    return best;
  }

  function categories() {
    const cats = CATEGORY_ORDER;
    return cats.map((name) => {
      const rows = SKUS.filter((s) => s.category === name);
      const agg = aggregate(rows);
      return {
        categoryName: name,
        ...agg,
        topVendors: rows.length ? [topVendor(rows)] : [],
        status: rows.length ? groupStatus(rows) : "Not Reviewed",
        icon: CATEGORY_META[name].icon,
        color: CATEGORY_META[name].color,
      };
    });
  }

  function subcategoriesFor(category) {
    const present = {};
    SKUS.filter((s) => s.category === category).forEach((s) => {
      (present[s.subcategory] = present[s.subcategory] || []).push(s);
    });
    return Object.keys(present).map((sub) => {
      const rows = present[sub];
      return {
        subcategoryName: sub,
        category,
        ...aggregate(rows),
        recommendedSupplier: topVendor(rows),
        status: groupStatus(rows),
        rows,
      };
    }).sort((a, b) => b.savingsOpportunity - a.savingsOpportunity);
  }

  function shops() {
    return SHOPS.map((sh) => {
      const rows = SKUS.filter((s) => s.shopCode === sh.code);
      const agg = aggregate(rows);
      const cats = Array.from(new Set(rows.map((r) => r.category)));
      const vendors = Array.from(new Set(rows.map((r) => r.recommendedVendor)));
      return {
        ...sh,
        baselineSpend: agg.baselineSpend,
        newSpend: agg.newSpend,
        savingsOpportunity: agg.savingsOpportunity,
        savingsPercentage: agg.savingsPercentage,
        skuCount: agg.skuCount,
        categoriesImpacted: cats,
        recommendedVendors: vendors,
        implementationStatus: groupStatus(rows),
        rows,
      };
    });
  }

  // Create a new brand (shop/property) or update an existing one. When an
  // existing brand is renamed / re-coded / moved region, the change is
  // propagated to every SKU that references it so roll-ups stay consistent.
  function upsertBrand({ originalCode, shopName, code, region } = {}) {
    shopName = (shopName || "").trim();
    code = (code || "").trim();
    region = (region || "").trim();
    if (!shopName) return { ok: false, error: "Brand name is required." };
    if (!code) return { ok: false, error: "Brand code is required." };

    // Register a brand-new region on the fly so it appears in filters.
    if (region && !REGIONS.includes(region)) REGIONS.push(region);

    const existing = originalCode ? SHOPS.find((s) => s.code === originalCode) : null;

    if (existing) {
      if (code !== existing.code && SHOPS.some((s) => s.code === code)) {
        return { ok: false, error: 'Code "' + code + '" is already used by another brand.' };
      }
      if (SHOPS.some((s) => s !== existing && s.shopName.toLowerCase() === shopName.toLowerCase())) {
        return { ok: false, error: 'A brand named "' + shopName + '" already exists.' };
      }
      const prevCode = existing.code;
      existing.shopName = shopName;
      existing.code = code;
      existing.region = region || existing.region;
      SKUS.forEach((s) => {
        if (s.shopCode === prevCode) {
          s.shopCode = code;
          s.shop = shopName;
          if (region) s.region = region;
        }
      });
      return { ok: true, mode: "updated", brand: existing };
    }

    if (SHOPS.some((s) => s.code === code)) {
      return { ok: false, error: 'Code "' + code + '" is already in use.' };
    }
    if (SHOPS.some((s) => s.shopName.toLowerCase() === shopName.toLowerCase())) {
      return { ok: false, error: 'A brand named "' + shopName + '" already exists.' };
    }
    const brand = { shopName, code, region: region || REGIONS[0] };
    SHOPS.push(brand);
    return { ok: true, mode: "created", brand };
  }

  // Unique next SKU id based on current catalog contents.
  function nextSkuId() {
    let n = SKUS.length + 1, id;
    do { id = "SKU-" + String(n++).padStart(3, "0"); } while (SKUS.some((s) => s.id === id));
    return id;
  }

  // Normalize a loose record (from Excel/CSV/OCR/manual) into a full SKU,
  // computing spend and savings.
  function makeSku(f) {
    const cp = +f.currentUnitPrice || 0, np = +f.newUnitPrice || 0, qty = +f.annualQuantity || 0;
    const currentAnnualSpend = round(cp * qty), newAnnualSpend = round(np * qty);
    const annualSavings = round(currentAnnualSpend - newAnnualSpend);
    return {
      id: f.id || nextSkuId(),
      productName: f.productName || "Unnamed item",
      description: f.description || f.productName || "",
      category: f.category || "Other",
      subcategory: f.subcategory || "Miscellaneous",
      currentVendor: f.currentVendor || "Current Local Vendor",
      recommendedVendor: f.recommendedVendor || "—",
      currentUnitPrice: cp, newUnitPrice: np,
      unitOfMeasure: f.unitOfMeasure || "Each", packSize: f.packSize || "—",
      annualQuantity: qty, currentAnnualSpend, newAnnualSpend, annualSavings,
      savingsPercentage: currentAnnualSpend ? round((annualSavings / currentAnnualSpend) * 100, 1) : 0,
      shop: f.shop || "", shopCode: f.shopCode || "", region: f.region || "",
      qualityTier: f.qualityTier || "Standard",
      implementationStatus: f.implementationStatus || "Not Reviewed",
      preferredItem: !!f.preferredItem, contractedItem: !!f.contractedItem,
      imageUrl: "", notes: f.notes || "",
    };
  }

  // Find a brand by name (case-insensitive) or create it on the fly.
  function ensureBrand(name, region) {
    name = (name || "").trim();
    if (!name) return null;
    let b = SHOPS.find((s) => s.shopName.toLowerCase() === name.toLowerCase());
    if (!b) {
      b = { shopName: name, code: nextBrandCode(), region: (region || "").trim() || REGIONS[0] };
      SHOPS.push(b);
    } else if (region && !b.region) {
      b.region = (region || "").trim();
    }
    return b;
  }

  // Bulk-import loose records. Each record may carry `brand` (or `shop`) and
  // `region`; unknown brands are created automatically and linked to the SKU.
  function importRecords(records) {
    const before = SHOPS.length;
    let added = 0;
    (records || []).forEach((r) => {
      const b = ensureBrand(r.brand || r.shop, r.region);
      SKUS.push(makeSku({
        ...r,
        shop: b ? b.shopName : (r.shop || ""),
        shopCode: b ? b.code : (r.shopCode || ""),
        region: b ? b.region : (r.region || ""),
      }));
      added++;
    });
    return { added, brandsCreated: SHOPS.length - before, totalBrands: SHOPS.length, totalSkus: SKUS.length };
  }

  // Wipe all brands and SKUs (reference taxonomy and vendors are kept).
  function clearAll() { SKUS.length = 0; SHOPS.length = 0; }

  // Restore the bundled demo dataset (5 brands + sample SKUs).
  function loadSampleData() {
    clearAll();
    SAMPLE_SHOPS.forEach((s) => SHOPS.push({ ...s }));
    buildSkus().forEach((s) => SKUS.push(s));
    return { totalBrands: SHOPS.length, totalSkus: SKUS.length };
  }

  // Suggest the next unused "Shop X" code for a new brand.
  function nextBrandCode() {
    for (let i = 0; i < 26; i++) {
      const candidate = "Shop " + String.fromCharCode(65 + i);
      if (!SHOPS.some((s) => s.code === candidate)) return candidate;
    }
    return "Shop " + (SHOPS.length + 1);
  }

  function vendorsView() {
    return VENDORS.map((v) => {
      const rows = SKUS.filter((s) => s.recommendedVendor === v.vendorName);
      const currentRows = SKUS.filter((s) => s.currentVendor === v.vendorName);
      const agg = aggregate(rows);
      const shopsServed = Array.from(new Set(rows.map((r) => r.shop)));
      const cats = Array.from(new Set(rows.map((r) => r.category)));
      return {
        ...v,
        categoriesSupplied: cats.length ? cats : v.categories,
        currentSpend: round(currentRows.reduce((s, r) => s + r.currentAnnualSpend, 0)),
        proposedSpend: agg.newSpend,
        savingsOpportunity: agg.savingsOpportunity,
        skuCount: agg.skuCount,
        shopsServed,
      };
    });
  }

  // Region-level roll up
  function regions() {
    return REGIONS.map((name) => {
      const rows = SKUS.filter((s) => s.region === name);
      return { regionName: name, ...aggregate(rows), rows };
    });
  }

  /* ------------------------- Savings opportunities ------------------------- */
  // Derived opportunity records, one per subcategory+shop cluster with badges.
  function opportunities() {
    const groups = {};
    SKUS.forEach((s) => {
      const key = s.category + "|" + s.subcategory + "|" + s.shopCode;
      (groups[key] = groups[key] || []).push(s);
    });
    const owners = ["A. Reyes", "M. Calderon", "J. Patel", "S. Okafor", "L. Tran"];
    let i = 0;
    return Object.keys(groups).map((key) => {
      const rows = groups[key];
      const agg = aggregate(rows);
      const first = rows[0];
      const ease = agg.savingsPercentage > 28 ? "Easy" : agg.savingsPercentage > 20 ? "Moderate" : "Complex";
      const transitionRisk = first.currentVendor !== first.recommendedVendor && first.currentVendor.indexOf("Local") >= 0;
      const risk = transitionRisk ? "Medium" : agg.savingsPercentage > 30 ? "Low" : "Low";
      const badges = [];
      if (agg.savingsPercentage >= 28 && ease === "Easy") badges.push("Quick Win");
      if (agg.savingsOpportunity >= 8000) badges.push("High Savings");
      if (first.qualityTier === "Luxury") badges.push("Needs Review");
      if (first.contractedItem) badges.push("Contract Required");
      if (!first.preferredItem) badges.push("Local Preference");
      if (first.implementationStatus === "Implemented") badges.push("Implemented");
      const targetDates = ["2026-07-15", "2026-08-01", "2026-09-30", "2026-10-15", "2026-12-01"];
      const rec = {
        id: "OPP-" + String(i + 1).padStart(3, "0"),
        name: first.subcategory + " standardization — " + first.shopCode,
        category: first.category,
        subcategory: first.subcategory,
        shop: first.shop,
        shopCode: first.shopCode,
        region: first.region,
        currentSupplier: first.currentVendor,
        recommendedSupplier: first.recommendedVendor,
        annualSavings: agg.savingsOpportunity,
        savingsPercentage: agg.savingsPercentage,
        ease,
        risk,
        status: groupStatus(rows),
        owner: owners[i % owners.length],
        targetDate: targetDates[i % targetDates.length],
        badges,
        skuCount: agg.skuCount,
        rows,
      };
      i++;
      return rec;
    }).sort((a, b) => b.annualSavings - a.annualSavings);
  }

  /* ------------------------ Implementation tracker ------------------------ */
  function trackerRows() {
    const trackerStatusMap = {
      "Not Reviewed": "Not started",
      "In Review": "In review",
      Approved: "Approved",
      Implemented: "Implemented",
      Deferred: "Deferred",
      Rejected: "Rejected",
    };
    const localOwners = ["GM - Front Desk", "Ops Lead", "Housekeeping Mgr", "Facilities Mgr", "Asst. GM"];
    const procOwners = ["A. Reyes", "M. Calderon", "J. Patel"];
    const groups = {};
    SKUS.forEach((s) => {
      const key = s.shopCode + "|" + s.category + "|" + s.subcategory;
      (groups[key] = groups[key] || []).push(s);
    });
    let i = 0;
    return Object.keys(groups).map((key) => {
      const rows = groups[key];
      const f = rows[0];
      const agg = aggregate(rows);
      const status = trackerStatusMap[groupStatus(rows)] || "In review";
      const blocker = f.currentVendor.indexOf("Local") >= 0 && f.qualityTier === "Luxury"
        ? "Local quality preference under review"
        : status === "Not started" ? "Awaiting shop review" : "";
      const rec = {
        id: "TRK-" + String(i + 1).padStart(3, "0"),
        shop: f.shop,
        shopCode: f.shopCode,
        region: f.region,
        category: f.category,
        subcategory: f.subcategory,
        recommendedVendor: f.recommendedVendor,
        skuCount: agg.skuCount,
        annualSavings: agg.savingsOpportunity,
        status,
        localOwner: localOwners[i % localOwners.length],
        procurementOwner: procOwners[i % procOwners.length],
        targetDate: ["2026-07-30", "2026-08-30", "2026-09-30", "2026-10-30"][i % 4],
        completionDate: status === "Implemented" ? "2026-05-20" : "",
        blocker,
        notes: f.notes,
      };
      i++;
      return rec;
    });
  }

  /* --------------------------- Security & logins --------------------------- */
  // Sample access/login telemetry for the security dashboard. Mirrors the
  // role-based access model so procurement admins can monitor who is signing in.
  const SECURITY_USERS = [
    { name: "Alana Reyes", email: "areyes@portal.co", role: "Procurement Admin", shop: "Corporate", region: "All", mfa: true, status: "Active", lastLogin: "2026-06-09 07:42", logins30d: 64 },
    { name: "Marco Calderon", email: "mcalderon@portal.co", role: "Category Manager", shop: "Corporate", region: "All", mfa: true, status: "Active", lastLogin: "2026-06-09 06:55", logins30d: 51 },
    { name: "Jordan Patel", email: "jpatel@portal.co", role: "Regional Manager", shop: "Harbor View Resort", region: "Southeast", mfa: true, status: "Active", lastLogin: "2026-06-08 18:21", logins30d: 38 },
    { name: "Sofia Okafor", email: "sokafor@portal.co", role: "Regional Manager", shop: "Cascade Lodge", region: "West", mfa: false, status: "Active", lastLogin: "2026-06-08 14:09", logins30d: 29 },
    { name: "Liam Tran", email: "ltran@portal.co", role: "Shop Manager", shop: "Magnolia Suites", region: "Southeast", mfa: false, status: "Active", lastLogin: "2026-06-07 09:33", logins30d: 17 },
    { name: "Priya Nair", email: "pnair@portal.co", role: "Shop Manager", shop: "Beacon Hill Inn", region: "Northeast", mfa: true, status: "Active", lastLogin: "2026-06-09 08:02", logins30d: 22 },
    { name: "Devon Brooks", email: "dbrooks@portal.co", role: "Shop Manager", shop: "Liberty Plaza Hotel", region: "Northeast", mfa: false, status: "Locked", lastLogin: "2026-05-28 11:47", logins30d: 4 },
    { name: "Grace Lim", email: "glim@portal.co", role: "Executive", shop: "Corporate", region: "All", mfa: true, status: "Active", lastLogin: "2026-06-06 16:15", logins30d: 9 },
  ];

  const LOGIN_EVENTS = [
    { time: "2026-06-09 08:02", user: "Priya Nair", role: "Shop Manager", ip: "73.118.4.21", location: "Boston, US", device: "Chrome · macOS", result: "Success", mfa: "Passed" },
    { time: "2026-06-09 07:42", user: "Alana Reyes", role: "Procurement Admin", ip: "98.45.12.7", location: "Atlanta, US", device: "Edge · Windows", result: "Success", mfa: "Passed" },
    { time: "2026-06-09 07:19", user: "Devon Brooks", role: "Shop Manager", ip: "201.44.9.88", location: "Unknown", device: "Firefox · Windows", result: "Blocked", mfa: "Failed" },
    { time: "2026-06-09 06:55", user: "Marco Calderon", role: "Category Manager", ip: "98.45.12.9", location: "Atlanta, US", device: "Chrome · Windows", result: "Success", mfa: "Passed" },
    { time: "2026-06-09 06:51", user: "Devon Brooks", role: "Shop Manager", ip: "201.44.9.88", location: "Unknown", device: "Firefox · Windows", result: "Failed", mfa: "—" },
    { time: "2026-06-08 22:14", user: "unknown@—", role: "—", ip: "45.146.8.130", location: "Off-network", device: "curl", result: "Blocked", mfa: "—" },
    { time: "2026-06-08 18:21", user: "Jordan Patel", role: "Regional Manager", ip: "66.87.3.14", location: "Miami, US", device: "Safari · iOS", result: "Success", mfa: "Passed" },
    { time: "2026-06-08 14:09", user: "Sofia Okafor", role: "Regional Manager", ip: "172.58.21.4", location: "Seattle, US", device: "Chrome · Android", result: "Success", mfa: "Not enrolled" },
    { time: "2026-06-07 09:33", user: "Liam Tran", role: "Shop Manager", ip: "73.201.5.66", location: "Savannah, US", device: "Chrome · Windows", result: "Success", mfa: "Not enrolled" },
    { time: "2026-06-06 16:15", user: "Grace Lim", role: "Executive", ip: "98.45.12.40", location: "Atlanta, US", device: "Safari · macOS", result: "Success", mfa: "Passed" },
  ];

  function securityMetrics() {
    const users = SECURITY_USERS;
    const active = users.filter((u) => u.status === "Active").length;
    const locked = users.filter((u) => u.status === "Locked").length;
    const mfaOn = users.filter((u) => u.mfa).length;
    const mfaPct = round((mfaOn / users.length) * 100, 1);
    const logins30d = users.reduce((s, u) => s + u.logins30d, 0);
    const failed = LOGIN_EVENTS.filter((e) => e.result === "Failed").length;
    const blocked = LOGIN_EVENTS.filter((e) => e.result === "Blocked").length;
    // logins by role
    const byRole = {};
    users.forEach((u) => { byRole[u.role] = (byRole[u.role] || 0) + u.logins30d; });
    return {
      totalUsers: users.length,
      activeUsers: active,
      lockedUsers: locked,
      mfaOn,
      mfaPct,
      logins30d,
      failedAttempts: failed,
      blockedAttempts: blocked,
      mfaGaps: users.filter((u) => !u.mfa).length,
      byRole,
      users,
      events: LOGIN_EVENTS,
    };
  }

  /* ----------------------------- AI categorizer ----------------------------- */
  // Lightweight keyword matcher that mimics future AI auto-categorization.
  const AI_RULES = [
    { kw: ["towel", "washcloth", "bath sheet"], cat: "Linens", sub: "Towels", type: "Terry Linen", tier: "Standard" },
    { kw: ["sheet", "flat sheet", "fitted"], cat: "Linens", sub: "Sheets", type: "Bed Linen", tier: "Standard" },
    { kw: ["pillowcase", "pillow case"], cat: "Linens", sub: "Pillowcases", type: "Bed Linen", tier: "Standard" },
    { kw: ["comforter", "duvet", "blanket", "bedding"], cat: "Linens", sub: "Bedding", type: "Bedding", tier: "Standard" },
    { kw: ["bath mat", "mat"], cat: "Linens", sub: "Bath Mats", type: "Terry Linen", tier: "Standard" },
    { kw: ["trash bag", "can liner", "garbage"], cat: "Disposables", sub: "Trash Bags", type: "Can Liner", tier: "Standard" },
    { kw: ["paper towel", "multifold", "hand towel paper"], cat: "Disposables", sub: "Paper Towels", type: "Paper Product", tier: "Standard" },
    { kw: ["toilet paper", "tissue", "bath tissue"], cat: "Disposables", sub: "Toilet Paper", type: "Paper Product", tier: "Standard" },
    { kw: ["glove", "nitrile", "vinyl glove"], cat: "Disposables", sub: "Gloves", type: "PPE", tier: "Standard" },
    { kw: ["cup", "tumbler"], cat: "Disposables", sub: "Cups", type: "Foodservice Disposable", tier: "Standard" },
    { kw: ["napkin"], cat: "Disposables", sub: "Napkins", type: "Foodservice Disposable", tier: "Economy" },
    { kw: ["shampoo", "conditioner", "lotion", "soap", "toiletr", "amenity"], cat: "Other", sub: "Guest Amenities", type: "Toiletries", tier: "Standard" },
    { kw: ["cleaner", "disinfectant", "sanitizer"], cat: "Supplies", sub: "Cleaning Supplies", type: "Chemical", tier: "Standard" },
  ];

  function categorize(text) {
    const t = (text || "").toLowerCase();
    let match = null, hits = 0;
    AI_RULES.forEach((rule) => {
      const matched = rule.kw.filter((k) => t.indexOf(k) >= 0).length;
      if (matched > hits) { hits = matched; match = rule; }
    });
    if (!match) {
      return { category: "Other", subcategory: "Miscellaneous", productType: "Unclassified", qualityTier: "Standard", normalizationGroup: "—", confidence: "Needs Manual Review", score: 0.2 };
    }
    let tier = match.tier;
    if (t.indexOf("luxury") >= 0 || t.indexOf("premium") >= 0 || t.indexOf("sateen") >= 0) tier = "Luxury";
    if (t.indexOf("economy") >= 0 || t.indexOf("basic") >= 0) tier = "Economy";
    let confidence = "High Confidence", score = 0.92;
    if (hits === 1) { confidence = "Medium Confidence"; score = 0.74; }
    if (t.split(" ").length <= 1) { confidence = "Low Confidence"; score = 0.55; }
    return {
      category: match.cat,
      subcategory: match.sub,
      productType: match.type,
      qualityTier: tier,
      normalizationGroup: match.cat + " · " + match.sub,
      confidence,
      score,
    };
  }

  /* ------------------------------ Roles config ------------------------------ */
  const ROLES = {
    "Procurement Admin": { label: "Procurement Admin", desc: "View and edit everything.", pages: "*" },
    "Category Manager": { label: "Category Manager", desc: "View all data, edit assigned categories.", pages: ["dashboard", "categories", "catalog", "savings", "vendors", "comparison", "tracker"] },
    "Regional Manager": { label: "Regional Manager", desc: "View assigned region and shops.", pages: ["dashboard", "categories", "catalog", "savings", "shops", "tracker"] },
    "Shop Manager": { label: "Shop Manager", desc: "View only shop-level data and action items.", pages: ["shops", "catalog", "comparison"] },
    Executive: { label: "Executive", desc: "View dashboard, savings summary, implementation status.", pages: ["dashboard", "savings", "tracker"] },
  };

  /* -------------------------------- CSV utils -------------------------------- */
  const CSV_TEMPLATE_COLUMNS = ["SKU", "Product Name", "Description", "Category", "Subcategory", "Shop", "Region", "Current Vendor", "Recommended Vendor", "Current Unit Price", "New Unit Price", "UOM", "Pack Size", "Annual Quantity", "Quality Tier", "Contracted Item", "Preferred Item", "Implementation Status", "Notes"];

  function skusToCsv(rows) {
    const header = CSV_TEMPLATE_COLUMNS.join(",");
    const lines = rows.map((s) => [
      s.id, s.productName, s.description, s.category, s.subcategory, s.shop, s.region,
      s.currentVendor, s.recommendedVendor, s.currentUnitPrice, s.newUnitPrice, s.unitOfMeasure,
      s.packSize, s.annualQuantity, s.qualityTier, s.contractedItem, s.preferredItem,
      s.implementationStatus, s.notes,
    ].map((v) => {
      const str = String(v == null ? "" : v);
      return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    }).join(","));
    return [header].concat(lines).join("\n");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  /* -------------------------------- Formatters -------------------------------- */
  const fmtMoney = (n, dec = 0) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtMoneyShort = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n);
  };
  const fmtPct = (n) => Number(n).toFixed(1) + "%";
  const fmtNum = (n) => Number(n).toLocaleString("en-US");

  /* --------------------------------- Export --------------------------------- */
  window.PSP = {
    round,
    REGIONS,
    SHOPS,
    VENDORS,
    STATUSES,
    SUBCATEGORIES,
    CATEGORY_META,
    CATEGORY_ORDER,
    SKUS,
    aggregate,
    categories,
    subcategoriesFor,
    shops,
    upsertBrand,
    nextBrandCode,
    nextSkuId,
    makeSku,
    ensureBrand,
    importRecords,
    clearAll,
    loadSampleData,
    vendorsView,
    regions,
    opportunities,
    trackerRows,
    securityMetrics,
    categorize,
    AI_RULES,
    ROLES,
    CSV_TEMPLATE_COLUMNS,
    skusToCsv,
    parseCsv,
    topVendor,
    groupStatus,
    fmt: { money: fmtMoney, moneyShort: fmtMoneyShort, pct: fmtPct, num: fmtNum },
  };
})();
