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

  // Vendor price books extracted from uploaded contracts. Each entry:
  // { id, vendorName, title, effectiveDate, expirationDate, source, uploadedAt,
  //   items: [{ name, description, category, subcategory, unitPrice, uom, packSize, notes }] }
  const CONTRACTS = [];

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

  // Roll a detailed category (e.g. "Bath Linens") up into one of the broad
  // taxonomy buckets. Matches on the category, subcategory, and product name.
  function categoryGroupOf(category, subcategory, name) {
    const t = ((category || "") + " " + (subcategory || "") + " " + (name || "")).toLowerCase();
    if (/linen|towel|sheet|pillow|duvet|blanket|bath ?mat|wash ?cloth|terry|coverlet|\bsham\b|\brobe|bedding|matelass|frette|sateen|percale/.test(t)) return "Linens";
    if (/disposable|\bpaper\b|napkin|tissue|\bcup\b|amenit|toiletr|\bsoap|shampoo|conditioner|lotion|can liner|trash ?bag|\bliner\b|glove|single.?use|toilet ?paper|facial|coaster|stir|straw/.test(t)) return "Disposables";
    if (/rental|\brent\b/.test(t)) return "Rentals";
    if (/door ?lock|smart ?lock|dead ?bolt|rfid|keyless|key ?card/.test(t)) return "Locks";
    if (/\btech|tablet|\btv\b|wifi|router|smart |device|electronic|thermostat|streaming/.test(t)) return "Technology";
    if (/suppl|cleaning|janitor|chemical|equipment|hanger|\biron\b|coffee|\bkitchen|guest ?supply|vacuum|\bmop\b|broom|detergent/.test(t)) return "Supplies";
    return "Other";
  }

  // Aggregated tiles by broad category group (for dashboard + category menu).
  function categoryGroups() {
    const present = Array.from(new Set(SKUS.map((s) => s.categoryGroup)));
    const ordered = CATEGORY_ORDER.filter((c) => present.includes(c)).concat(present.filter((c) => !CATEGORY_ORDER.includes(c)));
    return ordered.map((name) => {
      const rows = SKUS.filter((s) => s.categoryGroup === name);
      const meta = CATEGORY_META[name] || { icon: "📦", color: "#1e3a5f" };
      return { categoryName: name, ...aggregate(rows), topVendors: rows.length ? [topVendor(rows)] : [], status: rows.length ? groupStatus(rows) : "Not Reviewed", icon: meta.icon, color: meta.color };
    });
  }

  // The detailed categories that fall under one broad group.
  function categoriesInGroup(group) {
    const present = {};
    SKUS.filter((s) => s.categoryGroup === group).forEach((s) => { (present[s.category] = present[s.category] || []).push(s); });
    return Object.keys(present).map((cat) => {
      const rows = present[cat];
      return { categoryName: cat, ...aggregate(rows), recommendedSupplier: topVendor(rows), status: groupStatus(rows), rows };
    }).sort((a, b) => b.savingsOpportunity - a.savingsOpportunity);
  }

  /* -------------------- Contract ↔ SKU matching (F1) -------------------- */
  // Significant tokens for fuzzy matching: sizes (27x54), weights (14#),
  // numbers, and words of 3+ letters.
  function matchTokens(str) {
    return (String(str || "").toLowerCase().match(/\d+\s*x\s*\d+|\d+#|\d+(?:\.\d+)?|[a-z]{3,}/g) || []).map((t) => t.replace(/\s+/g, ""));
  }
  // Match a contract's price-book items against shop SKUs and compute the
  // savings if each shop switched to the contracted per-each price.
  function matchContractToSkus(contract, opts) {
    opts = opts || {};
    const minScore = opts.minScore || 0.34;
    const bySku = {};
    (contract.items || []).forEach((it) => {
      const itTok = new Set(matchTokens(it.name + " " + (it.description || "")));
      if (!itTok.size) return;
      SKUS.forEach((s) => {
        const sTok = matchTokens(s.productName + " " + s.description);
        if (!sTok.length) return;
        const inter = sTok.filter((t) => itTok.has(t)).length;
        const score = inter / Math.max(itTok.size, sTok.length);
        if (score < minScore) return;
        const cur = s.currentUnitPrice || 0, cp = it.unitPrice || 0;
        const annualSavings = round((cur - cp) * (s.annualQuantity || 0));
        const m = { item: it, sku: s, score, contractEach: cp, currentEach: cur, savingsEach: round(cur - cp), annualSavings };
        if (!bySku[s.id] || score > bySku[s.id].score) bySku[s.id] = m;
      });
    });
    const matches = Object.keys(bySku).map((k) => bySku[k]).sort((a, b) => b.annualSavings - a.annualSavings);
    const totalSavings = round(matches.reduce((a, m) => a + (m.annualSavings > 0 ? m.annualSavings : 0), 0));
    return { matches, totalSavings, matchedSkus: matches.length };
  }

  /* ----------------------- Data quality / anomalies (F2) ---------------- */
  function median(nums) {
    const s = nums.filter((n) => n > 0).sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function dataQuality() {
    const negative = SKUS.filter((s) => s.newUnitPrice > s.currentUnitPrice && s.currentUnitPrice > 0)
      .sort((a, b) => (b.newUnitPrice - b.currentUnitPrice) * b.annualQuantity - (a.newUnitPrice - a.currentUnitPrice) * a.annualQuantity);
    const missingPrice = SKUS.filter((s) => !(s.currentUnitPrice > 0) || !(s.newUnitPrice > 0));
    const missingQty = SKUS.filter((s) => !(s.annualQuantity > 0));
    const bySub = {};
    SKUS.forEach((s) => { const k = s.categoryGroup + "|" + s.subcategory; (bySub[k] = bySub[k] || []).push(s); });
    const outliers = [];
    Object.keys(bySub).forEach((k) => {
      const rows = bySub[k];
      if (rows.length < 4) return;
      const med = median(rows.map((r) => r.currentUnitPrice));
      if (!med) return;
      rows.forEach((r) => { if (r.currentUnitPrice > med * 3) outliers.push({ sku: r, median: round(med) }); });
    });
    outliers.sort((a, b) => b.sku.currentUnitPrice - a.sku.currentUnitPrice);
    return { negative, missingPrice, missingQty, outliers, counts: { negative: negative.length, missingPrice: missingPrice.length, missingQty: missingQty.length, outliers: outliers.length } };
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

  // ---- Per-user data scope (shop presidents see only their own shop) ----
  // SCOPE is null for full-access users (Procurement Admin / Category Manager).
  // For brand users it narrows every brand-facing roll-up to one shop or region.
  let SCOPE = null;
  function setScope(scope) {
    SCOPE = scope && scope.type && scope.type !== "all" ? scope : null;
  }
  function getScope() { return SCOPE; }
  function inScope(s) {
    if (!SCOPE) return true;
    if (SCOPE.type === "shop") {
      return s.shopCode === SCOPE.shopCode || (s.shop || "") === (SCOPE.shop || "");
    }
    if (SCOPE.type === "region") return (s.region || "") === (SCOPE.region || "");
    return true;
  }
  function scopedSkus() { return SCOPE ? SKUS.filter(inScope) : SKUS; }
  function scopedShops() {
    if (!SCOPE) return SHOPS;
    if (SCOPE.type === "region") return SHOPS.filter((sh) => (sh.region || "") === (SCOPE.region || ""));
    return SHOPS.filter((sh) => sh.code === SCOPE.shopCode || sh.shopName === SCOPE.shop);
  }

  function shops() {
    const scoped = SCOPE ? scopedShops() : SHOPS;
    return scoped.map((sh) => {
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
    // `id` is a unique surrogate row key (also the DB primary key). The vendor
    // SKU lives in `sku` and may repeat across brands — the same product is
    // bought by many shops — so it must never be used as the id.
    const sku = (f.sku != null && String(f.sku).trim() !== "") ? String(f.sku).trim()
      : (f.id != null && String(f.id).trim() !== "" ? String(f.id).trim() : "");
    let id = (f.id != null && String(f.id).trim() !== "") ? String(f.id).trim() : "";
    if (!id || SKUS.some((s) => s.id === id)) id = nextSkuId();
    return {
      id,
      sku,
      productName: f.productName || "Unnamed item",
      description: f.description || f.productName || "",
      category: f.category || "Other",
      // Broad bucket used for tiles/tabs/reports; the detailed `category`
      // (e.g. "Bath Linens") is kept and shown one level down.
      categoryGroup: f.categoryGroup || categoryGroupOf(f.category, f.subcategory, f.productName),
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
      reviewOwner: f.reviewOwner || "",
      targetDate: f.targetDate || "",
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

  // Clean a raw "winning vendor" cell — drop numbers and header/placeholder junk.
  function cleanVendorName(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";
    if (/^[\d.,$%\s]+$/.test(s)) return "";
    const junk = new Set(["winning vendor", "vendor", "total cost", "no savings", "no bid", "no bids", "n/a", "na", "-", "—", "current?"]);
    if (junk.has(s.toLowerCase())) return "";
    return s;
  }

  // Parse a "Shop-by-Shop master" workbook: each shop tab (between the
  // "Shop Views >>" / next ">>" separators) becomes that shop's SKUs. Detects
  // the header row within each tab, maps baseline/new each + the winning
  // (recommended) vendor, and tags everything to the Disposables category.
  // sheets = [{ name, rows: array-of-arrays }]. Returns records + the distinct
  // recommended vendors seen, so the caller can confirm new ones.
  function importShopByShopWorkbook(sheets, opts) {
    opts = opts || {};
    const category = opts.category || "Disposables";
    const low = (x) => (x == null ? "" : String(x).trim().toLowerCase());
    const names = sheets.map((s) => s.name);
    let candidates;
    const start = names.findIndex((n) => /shop views/i.test(n));
    if (start >= 0) {
      let end = sheets.length;
      for (let i = start + 1; i < names.length; i++) { if (/>>/.test(names[i])) { end = i; break; } }
      candidates = sheets.slice(start + 1, end).filter((s) => !/>>/.test(s.name));
    } else {
      const skip = /summary|tracker|calculator|index|no bid|tiered|request|standardization|old|outdated|ttm|consolidated|sku detail|aarete|>>/i;
      candidates = sheets.filter((s) => !skip.test(s.name));
    }
    const findHeader = (rows) => {
      for (let i = 0; i < Math.min(8, rows.length); i++) {
        const cells = (rows[i] || []).map(low);
        if (cells.some((c) => c === "sku") && cells.some((c) => c === "description" || c.includes("description"))) return { i, cells };
      }
      return null;
    };
    const pick = (cells, keys, avoid) => {
      for (const k of keys) { const i = cells.indexOf(k); if (i >= 0) return i; }
      for (const k of keys) { for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (c.includes(k) && !(avoid || []).some((a) => c.includes(a))) return i; } }
      return -1;
    };
    const num = (v) => +String(v == null ? "" : v).replace(/[$,\s]/g, "") || 0;
    const records = []; const used = []; const vendors = {}; const vbysub = {};
    candidates.forEach((sh) => {
      const rows = sh.rows || []; const H = findHeader(rows); if (!H) return;
      const c = H.cells;
      const ciSku = pick(c, ["sku"], ["winning"]);
      const ciDesc = pick(c, ["description"], ["winning"]);
      const ciSub = pick(c, ["sub-category", "sub category", "subcategory"]);
      const ciQty = pick(c, ["quantity", "qty"]);
      const ciCur = pick(c, ["bl $/ea", "old each price", "$ per each", "baseline $/ea", "old each"]);
      const ciNew = pick(c, ["winning b $/ea", "new each price", "new $ per each", "new each"]);
      let ciVen = -1; for (let i = 0; i < c.length; i++) { if (c[i].includes("winning vendor")) { ciVen = i; break; } }
      if (ciSku < 0) return;
      let cnt = 0;
      for (let r = H.i + 1; r < rows.length; r++) {
        const row = rows[r] || []; const g = (i) => (i >= 0 && i < row.length && row[i] != null ? row[i] : "");
        const sku = String(g(ciSku)).trim();
        if (!sku || /^(none|nan)$/i.test(sku)) continue;
        const desc = String(g(ciDesc)).trim();
        let cur = num(g(ciCur)); let nw = num(g(ciNew));
        const cap = opts.maxEach || 1000;          // a per-each above this is a mis-picked total
        if (cur > cap) cur = 0;
        if (nw > cap) nw = 0;
        if (!nw) nw = cur; if (!cur) cur = nw;     // mirror so both sides have a per-each
        if (!cur && !nw) continue;                 // no usable price → skip (avoids $0 junk rows)
        if (!desc && !/[a-z]/i.test(sku)) continue;
        const ven = cleanVendorName(g(ciVen));
        const sub = String(g(ciSub)).trim() || "Miscellaneous";
        records.push({ shop: sh.name, sku, productName: desc || sku, description: desc, subcategory: sub, category, currentUnitPrice: cur, newUnitPrice: nw, recommendedVendor: ven, annualQuantity: num(g(ciQty)) });
        if (ven) { vendors[ven] = (vendors[ven] || 0) + 1; (vbysub[sub] = vbysub[sub] || new Set()).add(ven); }
        cnt++;
      }
      if (cnt) used.push(sh.name + " (" + cnt + ")");
    });
    return { records, sheetsUsed: used, vendors: Object.keys(vendors).sort(), vendorsBySub: vbysub };
  }

  /* ---------------------------- Vendor contracts ---------------------------- */
  function nextContractId() {
    let n = CONTRACTS.length + 1, id;
    do { id = "CON-" + String(n++).padStart(3, "0"); } while (CONTRACTS.some((c) => c.id === id));
    return id;
  }

  // Normalize one extracted contract line item into a price-book entry.
  function normContractItem(it) {
    const name = String(it.name || it.productName || it.service || it.description || "").trim();
    return {
      name: name || "Unnamed item",
      description: String(it.description || "").trim(),
      category: String(it.category || "").trim() || "Other",
      subcategory: String(it.subcategory || "").trim() || "Miscellaneous",
      unitPrice: +it.unitPrice || +it.price || +it.unitPriceEach || 0,
      uom: String(it.uom || it.unitOfMeasure || "Each").trim() || "Each",
      packSize: String(it.packSize || "").trim(),
      notes: String(it.notes || "").trim(),
    };
  }

  // Add (or replace, if same vendor+title) a contract price book. Ensures the
  // vendor exists in the VENDORS list so it shows on the Vendors page.
  function importContract(c) {
    const vendorName = String(c.vendorName || "").trim() || "Unnamed Vendor";
    const items = (c.items || []).map(normContractItem).filter((i) => i.name && i.name !== "Unnamed item" || i.unitPrice);
    const cats = Array.from(new Set(items.map((i) => i.category)));
    const entry = {
      id: c.id || nextContractId(),
      vendorName,
      title: String(c.title || "").trim() || (vendorName + " contract"),
      effectiveDate: String(c.effectiveDate || "").trim(),
      expirationDate: String(c.expirationDate || "").trim(),
      source: String(c.source || "").trim(),
      uploadedAt: c.uploadedAt || new Date().toISOString(),
      items,
    };
    // Replace any prior price book for the same vendor + title.
    const idx = CONTRACTS.findIndex((x) => x.vendorName.toLowerCase() === vendorName.toLowerCase() && x.title.toLowerCase() === entry.title.toLowerCase());
    if (idx >= 0) { entry.id = CONTRACTS[idx].id; CONTRACTS[idx] = entry; }
    else CONTRACTS.push(entry);
    // Register the vendor if it's new so the Vendors page lists it.
    if (!VENDORS.some((v) => v.vendorName.toLowerCase() === vendorName.toLowerCase())) {
      VENDORS.push({ vendorName, categories: cats.length ? cats : ["Other"], contractStatus: "Contract on file", pricingStatus: "Contracted", notes: "Added from an uploaded contract." });
    }
    return { contract: entry, itemCount: items.length, vendorName, categories: cats };
  }

  function deleteContract(id) {
    const i = CONTRACTS.findIndex((c) => c.id === id);
    if (i >= 0) CONTRACTS.splice(i, 1);
  }

  // Promote a vendor contract / price book into the catalog as SKUs so the data
  // shows across the whole portal (dashboard, catalog, shop view, savings).
  // Optionally attach to a shop/brand (created if it doesn't exist yet).
  function publishContractToCatalog(contractId, shopName) {
    const c = CONTRACTS.find((x) => x.id === contractId);
    if (!c) return { added: 0 };
    let brand = null;
    if (shopName) {
      brand = SHOPS.find((b) => b.shopName === shopName) || null;
      if (!brand) { brand = { shopName, code: nextBrandCode(), region: "" }; SHOPS.push(brand); }
    }
    let added = 0;
    (c.items || []).forEach((it) => {
      SKUS.push(makeSku({
        sku: it.name, productName: it.name, description: it.description || it.name,
        category: it.category, subcategory: it.subcategory,
        currentVendor: c.vendorName, recommendedVendor: c.vendorName,
        currentUnitPrice: it.unitPrice, newUnitPrice: it.unitPrice,
        unitOfMeasure: it.uom, packSize: it.packSize,
        shop: brand ? brand.shopName : "", shopCode: brand ? brand.code : "", region: brand ? brand.region : "",
        contractedItem: true,
      }));
      added++;
    });
    return { added, brand };
  }

  // All price books for a vendor (case-insensitive).
  function contractsByVendor(vendorName) {
    const n = String(vendorName || "").toLowerCase();
    return CONTRACTS.filter((c) => c.vendorName.toLowerCase() === n);
  }

  // Flag the same SKU or same product appearing more than once FROM THE SAME
  // VENDOR — across the catalog and uploaded contracts/invoices. These are the
  // "review me" cases: a vendor double-listing a product (often at different
  // prices). Optionally scope to one vendor. Returns flags sorted by the
  // biggest price spread first.
  function normName(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  const GENERIC_VENDORS = new Set(["", "—", "-", "current local vendor", "local vendor", "various", "n/a", "na", "unknown", "tbd"]);
  function vendorDuplicates(vendorFilter) {
    const only = vendorFilter ? String(vendorFilter).toLowerCase() : null;
    const map = {};
    const add = (key, rec) => { (map[key] = map[key] || []).push(rec); };
    // Catalog rows keyed by vendor + sku and vendor + product name.
    SKUS.forEach((s) => {
      const vendor = (s.currentVendor || "").trim();
      if (!vendor || GENERIC_VENDORS.has(vendor.toLowerCase()) || (only && vendor.toLowerCase() !== only)) return;
      const v = vendor.toLowerCase();
      const rec = { source: "Catalog", vendor, sku: s.sku || "", name: s.productName, shop: s.shop || "", price: +s.currentUnitPrice || 0, uom: s.unitOfMeasure, pack: s.packSize };
      if (s.sku) add("SKU" + v + "" + s.sku.toLowerCase(), rec);
      if (s.productName) add("NAME" + v + "" + normName(s.productName), rec);
    });
    // Contract / invoice price-book items keyed by vendor + name.
    CONTRACTS.forEach((c) => {
      const vendor = (c.vendorName || "").trim();
      if (!vendor || GENERIC_VENDORS.has(vendor.toLowerCase()) || (only && vendor.toLowerCase() !== only)) return;
      const v = vendor.toLowerCase();
      (c.items || []).forEach((it) => {
        const rec = { source: "Contract: " + (c.title || c.id), vendor, sku: "", name: it.name, shop: "", price: +it.unitPrice || 0, uom: it.uom, pack: it.packSize };
        if (it.name) add("NAME" + v + "" + normName(it.name), rec);
      });
    });
    const flags = [];
    Object.keys(map).forEach((k) => {
      const grp = map[k];
      if (grp.length < 2) return;
      const prices = grp.map((g) => g.price).filter((p) => p > 0);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      flags.push({
        kind: k[0] === "S" ? "Same SKU" : "Same product",
        vendor: grp[0].vendor, name: grp[0].name, sku: grp[0].sku,
        count: grp.length, min, max, spread: round(max - min), items: grp,
      });
    });
    flags.sort((a, b) => (b.spread - a.spread) || (b.count - a.count));
    return flags;
  }

  // Apply admin edits to an existing SKU and recompute spend/savings.
  function updateSku(id, fields) {
    const s = SKUS.find((x) => x.id === id);
    if (!s) return null;
    Object.assign(s, fields);
    const cp = +s.currentUnitPrice || 0, np = +s.newUnitPrice || 0, qty = +s.annualQuantity || 0;
    s.currentUnitPrice = cp; s.newUnitPrice = np; s.annualQuantity = qty;
    s.currentAnnualSpend = round(cp * qty);
    s.newAnnualSpend = round(np * qty);
    s.annualSavings = round(s.currentAnnualSpend - s.newAnnualSpend);
    s.savingsPercentage = s.currentAnnualSpend ? round((s.annualSavings / s.currentAnnualSpend) * 100, 1) : 0;
    return s;
  }

  // Wipe all brands and SKUs (reference taxonomy and vendors are kept).
  function clearAll() { SKUS.length = 0; SHOPS.length = 0; CONTRACTS.length = 0; }

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
    scopedSkus().forEach((s) => {
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
  // brandOnly roles see ONLY the Brand View group; the entire Procurement
  // section is hidden from them. "dashboard" in their pages only unlocks the
  // Market Insights brand page (Executive Summary/Dashboard are gated out by
  // the brandOnly group check in app.js).
  const ROLES = {
    "Procurement Admin": { label: "Procurement Admin", desc: "View and edit everything.", pages: "*" },
    "Category Manager": { label: "Category Manager", desc: "View all data, edit assigned categories.", pages: ["dashboard", "categories", "catalog", "savings", "vendors", "comparison", "tracker"] },
    "Regional Manager": { label: "Regional Manager", desc: "Brand View for the assigned region only.", pages: ["catalog", "savings", "shops", "comparison", "dashboard"], brandOnly: true },
    "Shop Manager": { label: "Shop Manager", desc: "Brand View for one assigned shop only.", pages: ["catalog", "savings", "shops", "comparison", "dashboard"], brandOnly: true },
    Executive: { label: "Executive", desc: "Brand president — Brand View for their own shop.", pages: ["catalog", "savings", "shops", "comparison", "dashboard"], brandOnly: true },
  };

  /* -------------------------------- CSV utils -------------------------------- */
  const CSV_TEMPLATE_COLUMNS = ["SKU", "Product Name", "Description", "Category", "Subcategory", "Shop", "Region", "Current Vendor", "Recommended Vendor", "Current Unit Price", "New Unit Price", "UOM", "Pack Size", "Annual Quantity", "Quality Tier", "Contracted Item", "Preferred Item", "Implementation Status", "Notes"];

  function skusToCsv(rows) {
    const header = CSV_TEMPLATE_COLUMNS.join(",");
    const lines = rows.map((s) => [
      s.sku || s.id, s.productName, s.description, s.category, s.subcategory, s.shop, s.region,
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

  /* ----------------------- AP spend (buying patterns) ----------------------- */
  // Time-stamped accounts-payable purchase lines. Unlike SKUS (annual totals),
  // these carry a date so we can show WHEN each category is bought.
  const AP = [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const AP_TEMPLATE_COLUMNS = ["Date", "Shop", "Category", "Subcategory", "Vendor", "Amount", "Quantity", "Description"];
  let apSeq = 1;

  // Parse a variety of date encodings into a JS Date (or null).
  function parseApDate(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && isFinite(v) && v > 59 && v < 80000) { // Excel serial day
      const d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(+d) ? null : d;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[1] - 1, +m[2]); }
    // Accounting period as YYYYMM (e.g. finperiod 202605) → 1st of that month.
    m = s.match(/^(\d{4})(\d{2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return new Date(+m[1], +m[2] - 1, 1);
    const d = new Date(s);
    return isNaN(+d) ? null : d;
  }

  function makeApRow(f) {
    const d = f._date instanceof Date ? f._date : parseApDate(f.date);
    const amount = +String(f.amount == null ? "" : f.amount).replace(/[$,\s]/g, "") || 0;
    const qty = +String(f.quantity == null ? "" : f.quantity).replace(/[$,\s]/g, "") || 0;
    const category = (f.category || "").trim();
    const group = categoryGroupOf(category, f.subcategory, f.description || f.vendor);
    return {
      id: f.id || ("AP-" + (apSeq++)),
      date: d ? d.toISOString().slice(0, 10) : "",
      year: d ? d.getFullYear() : 0,
      monthIndex: d ? d.getMonth() : -1,
      ym: d ? (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")) : "",
      sku: String(f.sku || "").trim(),
      shop: f.shop || "", shopCode: f.shopCode || "", region: f.region || "",
      category: category || "Other", categoryGroup: group, subcategory: f.subcategory || "",
      vendor: f.vendor || "", amount: round(amount), quantity: qty, description: f.description || "",
    };
  }

  // Token Dice similarity (0..1) with exact/substring boosts — for matching a
  // vendor report's shop name to one of our brands.
  function tokens(s) { return normName(s).split(" ").filter((t) => t.length > 1); }
  function similarity(a, b) {
    a = normName(a); b = normName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    const setB = new Set(tb); let inter = 0;
    ta.forEach((t) => { if (setB.has(t)) inter++; });
    return (2 * inter) / (ta.length + tb.length);
  }
  // Best fuzzy brand match for a raw shop name (or null below threshold).
  function fuzzyShop(raw, threshold) {
    const r = normName(raw); if (!r) return null;
    let best = null, score = 0;
    SHOPS.forEach((b) => {
      const s = Math.max(similarity(r, b.shopName), similarity(r, b.code));
      if (s > score) { score = s; best = b; }
    });
    return best && score >= (threshold || 0.6) ? { brand: best, score } : null;
  }

  // Resolve a free-text shop/property string to a known brand — exact first,
  // then fuzzy — so AP rows align with the catalog's shops and inherit a region.
  function resolveApShop(rec) {
    const raw = String(rec.shop || "").trim();
    if (!raw) return rec;
    let hit = SHOPS.find((b) => b.code.toLowerCase() === raw.toLowerCase() || b.shopName.toLowerCase() === raw.toLowerCase());
    if (!hit) { const f = fuzzyShop(raw, 0.72); if (f) hit = f.brand; }
    if (hit) { rec.shop = hit.shopName; rec.shopCode = hit.code; rec.region = rec.region || hit.region; }
    return rec;
  }

  // Distinct AP shop names that don't match a known brand, with a fuzzy
  // suggestion — drives the reconciliation step on the Vendor Spend page.
  function unmatchedApShops() {
    const brand = new Set(SHOPS.map((b) => b.shopName.toLowerCase()));
    const m = {};
    AP.forEach((r) => {
      const s = (r.shop || "").trim(); if (!s || brand.has(s.toLowerCase())) return;
      const e = m[s] || (m[s] = { raw: s, count: 0, spend: 0 });
      e.count++; e.spend += r.amount;
    });
    return Object.keys(m).map((k) => {
      const f = fuzzyShop(m[k].raw, 0.4);
      return { raw: m[k].raw, count: m[k].count, spend: round(m[k].spend), suggestion: f ? f.brand.shopName : "", score: f ? Math.round(f.score * 100) : 0 };
    }).sort((a, b) => b.spend - a.spend);
  }

  // Remap every AP row with a given raw shop name onto a known brand.
  function remapApShop(raw, toShopName) {
    const brand = SHOPS.find((b) => b.shopName === toShopName);
    let n = 0;
    AP.forEach((r) => {
      if ((r.shop || "") === raw) { r.shop = toShopName; if (brand) { r.shopCode = brand.code; r.region = brand.region; } n++; }
    });
    return n;
  }

  // Vendor-centric roll-ups for the Vendor Spend page (optional vendor filter).
  function apVendorSummary(vendorFilter) {
    const rows = AP.filter((r) => r.amount > 0 && (!vendorFilter || vendorFilter === "All" || r.vendor === vendorFilter));
    const totalSpend = round(rows.reduce((a, r) => a + r.amount, 0));
    const totalQty = round(rows.reduce((a, r) => a + (r.quantity || 0), 0));
    const skuKey = (r) => (r.sku || normName(r.description) || normName(r.category)) + "@" + r.vendor;
    const vend = {}, cat = {}, ym = {}, sku = {};
    rows.forEach((r) => {
      const v = r.vendor || "—";
      (vend[v] = vend[v] || { vendor: v, spend: 0, qty: 0, skus: new Set() });
      vend[v].spend += r.amount; vend[v].qty += r.quantity || 0; vend[v].skus.add(r.sku || normName(r.description));
      const g = r.categoryGroup || "Other"; cat[g] = (cat[g] || 0) + r.amount;
      if (r.ym) ym[r.ym] = (ym[r.ym] || 0) + r.amount;
      const k = skuKey(r);
      (sku[k] = sku[k] || { name: r.description || r.sku || "—", sku: r.sku || "", vendor: r.vendor || "", category: r.categoryGroup || "", spend: 0, qty: 0 });
      sku[k].spend += r.amount; sku[k].qty += r.quantity || 0;
    });
    const byVendor = Object.values(vend).map((v) => ({ vendor: v.vendor, spend: round(v.spend), qty: round(v.qty), skus: v.skus.size })).sort((a, b) => b.spend - a.spend);
    const byCategory = Object.keys(cat).map((k) => ({ name: k, value: round(cat[k]) })).sort((a, b) => b.value - a.value);
    const trend = Object.keys(ym).sort().map((k) => ({ ym: k, amount: round(ym[k]) }));
    const topSkus = Object.values(sku).map((s) => ({ ...s, spend: round(s.spend), qty: round(s.qty) })).sort((a, b) => b.spend - a.spend).slice(0, 20);
    const distinctSkus = Object.keys(sku).length;
    return { lines: rows.length, totalSpend, totalQty, distinctSkus, vendorCount: byVendor.length, byVendor, byCategory, trend, topSkus };
  }

  function apVendors() { return Array.from(new Set(AP.map((r) => r.vendor).filter(Boolean))).sort(); }

  // Pricing discrepancies straight from the sales report: the SAME item invoiced
  // at different per-each prices across shops/periods. The headline savings is
  // what you'd recover if every line matched the lowest per-each actually paid.
  function apPriceDiscrepancies(vendorFilter, opts) {
    opts = opts || {};
    const minVar = opts.minVar != null ? opts.minVar : 0.05; // ignore <5% spread
    const rows = AP.filter((r) => +r.amount > 0 && +r.quantity > 0 && (!vendorFilter || vendorFilter === "All" || r.vendor === vendorFilter));
    const groups = {};
    rows.forEach((r) => {
      const key = (r.sku || normName(r.description)); if (!key) return;
      const each = r.amount / r.quantity;
      const g = groups[key] || (groups[key] = { sku: r.sku || "", name: r.description || r.sku || "", vendor: r.vendor || "", category: r.categoryGroup || "", lines: [], shops: {}, spend: 0, qty: 0 });
      g.lines.push({ shop: r.shop, each, qty: r.quantity, amount: r.amount });
      g.shops[r.shop || "—"] = true; g.spend += r.amount; g.qty += r.quantity;
    });
    const out = [];
    Object.keys(groups).forEach((k) => {
      const g = groups[k];
      const eaches = g.lines.map((l) => l.each).filter((e) => e > 0);
      if (eaches.length < 2) return;
      const min = Math.min(...eaches), max = Math.max(...eaches);
      if (min <= 0 || (max - min) < min * minVar) return;
      const potential = round(g.lines.reduce((a, l) => a + Math.max(0, l.each - min) * l.qty, 0));
      out.push({
        sku: g.sku, name: g.name, vendor: g.vendor, category: g.category,
        shops: Object.keys(g.shops).length, lines: g.lines.length,
        min: round(min, 4), max: round(max, 4), spread: round(max - min, 4),
        ratio: min > 0 ? round(max / min, 1) : 0, avg: round(g.spend / g.qty, 4),
        spend: round(g.spend), potential,
      });
    });
    out.sort((a, b) => b.potential - a.potential);
    return { rows: out, total: round(out.reduce((a, x) => a + x.potential, 0)) };
  }

  // Price compliance: compare each invoiced AP line to the vendor's contracted
  // price on a normalized PER-EACH basis (pack/case sizes divided out via the
  // UoM parser). Flags overpayments (paid above contract), off-contract /
  // maverick spend, and — when the per-each ratio is implausibly large — likely
  // UoM mismatches for review instead of counting them as real overpayment.
  function priceCompliance(opts) {
    opts = opts || {};
    const tol = opts.tol != null ? opts.tol : 0.02;        // 2% grace
    const outlier = opts.outlier != null ? opts.outlier : 6; // ratio beyond this = likely UoM issue
    const packQty = (s) => (window.UOM ? (window.UOM.parsePackQty(s) || 1) : 1);
    const idx = {};
    CONTRACTS.forEach((c) => {
      const v = (c.vendorName || "").toLowerCase();
      const items = (c.items || []).filter((it) => +it.unitPrice > 0)
        .map((it) => ({ name: it.name, price: +it.unitPrice, pack: packQty(((it.uom || "") + " " + (it.packSize || "")).trim()) }));
      idx[v] = (idx[v] || []).concat(items);
    });
    let invoiced = 0, onContract = 0, offContract = 0, overpayment = 0, compliant = 0, checked = 0;
    const vend = {};
    const overRows = [], offRows = [], uomRows = [];
    AP.forEach((r) => {
      const amt = +r.amount || 0; if (amt <= 0) return;
      invoiced += amt;
      const items = idx[(r.vendor || "").toLowerCase()] || [];
      const label = r.description || r.sku || "";
      let best = null, score = 0;
      items.forEach((it) => {
        const s = Math.max(similarity(label, it.name), r.sku ? similarity(r.sku, it.name) : 0);
        if (s > score) { score = s; best = it; }
      });
      const ve = (vend[r.vendor || "—"] = vend[r.vendor || "—"] || { vendor: r.vendor || "—", invoiced: 0, overpayment: 0, offContract: 0 });
      ve.invoiced += amt;
      if (best && score >= 0.6) {
        onContract += amt;
        const qty = +r.quantity || 0;
        if (qty > 0) {
          checked++;
          const apPack = packQty(label);                  // eaches per invoiced unit
          const paidEach = (amt / qty) / apPack;          // normalized $/each
          const contractEach = best.price / best.pack;    // normalized $/each
          const hi = Math.max(paidEach, contractEach), lo = Math.min(paidEach, contractEach);
          const ratio = lo > 0 ? hi / lo : Infinity;
          const base = { shop: r.shop, vendor: r.vendor, item: label, sku: r.sku, date: r.date, qty, paidEach: round(paidEach, 4), contractEach: round(contractEach, 4), ratio: isFinite(ratio) ? Math.round(ratio * 10) / 10 : 999, amount: round(amt), match: best.name, score: Math.round(score * 100) };
          if (ratio > outlier) {
            uomRows.push(base);                           // quarantine: almost certainly a pack/UoM mismatch
          } else if (paidEach > contractEach * (1 + tol)) {
            const over = round((paidEach - contractEach) * qty * apPack);
            overpayment += over; ve.overpayment += over;
            overRows.push(Object.assign({ over }, base));
          } else { compliant += amt; }
        }
      } else {
        offContract += amt; ve.offContract += amt;
        offRows.push({ shop: r.shop, vendor: r.vendor, item: label, sku: r.sku, date: r.date, qty: +r.quantity || 0, amount: round(amt) });
      }
    });
    overRows.sort((a, b) => b.over - a.over);
    offRows.sort((a, b) => b.amount - a.amount);
    uomRows.sort((a, b) => b.ratio - a.ratio);
    const byVendor = Object.keys(vend).map((k) => vend[k]).map((x) => ({ vendor: x.vendor, invoiced: round(x.invoiced), overpayment: round(x.overpayment), offContract: round(x.offContract) })).sort((a, b) => (b.overpayment + b.offContract) - (a.overpayment + a.offContract));
    return {
      hasAp: AP.some((r) => +r.amount > 0), hasContracts: CONTRACTS.length > 0,
      totals: {
        invoiced: round(invoiced), onContract: round(onContract), offContract: round(offContract),
        overpayment: round(overpayment), compliant: round(compliant), checked, uomFlagged: uomRows.length,
        onContractPct: invoiced > 0 ? round(onContract / invoiced * 100, 1) : 0,
        offContractPct: invoiced > 0 ? round(offContract / invoiced * 100, 1) : 0,
        leakage: round(overpayment + offContract),
      },
      overRows, offRows, uomRows, byVendor,
    };
  }

  // Ingest a header+rows matrix (from CSV/XLSX) into AP. If `mapping` (from
  // Claude's mapcols) is supplied, use those 0-based column indices; otherwise
  // fall back to flexible header-name matching.
  function ingestApRows(matrix, mapping, opts) {
    if (!matrix || !matrix.length) return { added: 0 };
    opts = opts || {};
    const header = matrix[0].map((h) => String(h == null ? "" : h).trim().toLowerCase());
    const find = (names) => { for (const n of names) { const i = header.findIndex((h) => h === n || h.includes(n)); if (i >= 0) return i; } return -1; };
    const valid = (i) => typeof i === "number" && i >= 0;
    const map = mapping || {};
    const di = valid(map.date) ? map.date : find(["date", "invoice date", "posting date", "ship date", "shipdate", "period", "finperiod", "month"]);
    const si = valid(map.shop) ? map.shop : find(["shop", "customer", "property", "company", "account", "location", "store", "brand"]);
    const ci = valid(map.category) ? map.category : find(["category", "inventory_type", "inventory type"]);
    const subi = valid(map.subcategory) ? map.subcategory : find(["subcategory", "sub category", "sub-category", "inventory_type_and_cat"]);
    const vi = valid(map.vendor) ? map.vendor : find(["vendor", "supplier", "payee"]);
    const ai = valid(map.amount) ? map.amount : find(["ext_price", "ext price", "extended", "amount", "spend", "sales", "total", "cost", "value"]);
    const qi = valid(map.quantity) ? map.quantity : find(["qty", "quantity", "converted_qty", "units"]);
    const desi = valid(map.description) ? map.description : find(["sku_description", "description", "item", "product", "memo", "detail"]);
    const ski = valid(map.sku) ? map.sku : find(["sku", "item number", "item #", "item code", "product id", "product code", "part", "mpn", "material"]);
    let added = 0;
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row.length) continue;
      const get = (i) => (i >= 0 ? row[i] : "");
      const rec = makeApRow({
        date: get(di), shop: String(get(si) || "").trim(), category: opts.category || get(ci), subcategory: get(subi),
        vendor: get(vi), amount: get(ai), quantity: get(qi), description: get(desi), sku: get(ski),
      });
      if (!rec.date && !rec.amount) continue;
      if (!rec.vendor && opts.vendor) rec.vendor = opts.vendor;   // stamp the report's vendor
      resolveApShop(rec);
      AP.push(rec);
      added++;
    }
    return { added };
  }

  // Ingest already-normalized line items (from Claude's `spend` extraction of a
  // document / free text). Each item: {date, shop, vendor, category, ...}.
  function ingestApItems(items, opts) {
    opts = opts || {};
    let added = 0;
    (items || []).forEach((it) => {
      const rec = makeApRow(opts.category ? Object.assign({}, it, { category: opts.category }) : it);
      if (!rec.date && !rec.amount) return;
      if (!rec.vendor && opts.vendor) rec.vendor = opts.vendor;
      resolveApShop(rec);
      AP.push(rec);
      added++;
    });
    return { added };
  }

  function apClear() { AP.length = 0; }
  function apShops() { return Array.from(new Set(AP.map((r) => r.shop).filter(Boolean))).sort(); }

  // Catalog savings RATE (savings$ / baseline$) for a shop and/or category
  // group — the negotiated discount we expect on that spend.
  function catalogRate(shopName, group) {
    let rows = SKUS;
    if (shopName) rows = rows.filter((s) => s.shop === shopName);
    if (group) rows = rows.filter((s) => s.categoryGroup === group);
    const agg = aggregate(rows);
    return agg.baselineSpend > 0 ? agg.savingsOpportunity / agg.baselineSpend : 0;
  }

  // Actual-volume savings for one shop: apply the catalog savings rate (per
  // category group, with fallbacks) to what the shop ACTUALLY invoiced in AP.
  // Annualizes by the period the AP data spans.
  function apShopSavings(shopName) {
    const rows = AP.filter((r) => r.shop === shopName && r.amount > 0);
    if (!rows.length) return null;
    const byGroup = {};
    let minD = null, maxD = null;
    rows.forEach((r) => {
      const g = r.categoryGroup || "Other";
      byGroup[g] = (byGroup[g] || 0) + r.amount;
      if (r.date) { if (!minD || r.date < minD) minD = r.date; if (!maxD || r.date > maxD) maxD = r.date; }
    });
    let actualSpend = 0, savings = 0;
    const groups = [];
    Object.keys(byGroup).forEach((g) => {
      const spend = byGroup[g];
      const rate = catalogRate(shopName, g) || catalogRate(shopName, null) || catalogRate(null, g) || catalogRate(null, null);
      const sv = round(spend * rate);
      actualSpend += spend; savings += sv;
      groups.push({ group: g, spend: round(spend), rate: round(rate * 100, 1), savings: sv });
    });
    let days = 0, factor = 1;
    if (minD && maxD) { days = Math.max(1, (new Date(maxD) - new Date(minD)) / 86400000 + 1); factor = 365 / days; }
    groups.sort((a, b) => b.savings - a.savings);
    return {
      shop: shopName, lines: rows.length,
      actualSpend: round(actualSpend), savings: round(savings),
      annualizedSpend: round(actualSpend * factor), annualizedSavings: round(savings * factor),
      minDate: minD, maxDate: maxD, months: Math.round((days / 30.44) * 10) / 10,
      savingsPct: actualSpend > 0 ? round((savings / actualSpend) * 100, 1) : 0,
      groups,
    };
  }

  // Roll up actual-volume savings across every shop that has AP data.
  function apSavingsAll() {
    const shops = Array.from(new Set(AP.filter((r) => r.amount > 0).map((r) => r.shop).filter(Boolean)));
    const list = shops.map(apShopSavings).filter(Boolean).sort((a, b) => b.savings - a.savings);
    const totals = list.reduce((t, s) => ({
      actualSpend: t.actualSpend + s.actualSpend, savings: t.savings + s.savings,
      annualizedSpend: t.annualizedSpend + s.annualizedSpend, annualizedSavings: t.annualizedSavings + s.annualizedSavings,
    }), { actualSpend: 0, savings: 0, annualizedSpend: 0, annualizedSavings: 0 });
    const dates = AP.map((r) => r.date).filter(Boolean).sort();
    return {
      shops: list, hasData: list.length > 0,
      totals: { actualSpend: round(totals.actualSpend), savings: round(totals.savings), annualizedSpend: round(totals.annualizedSpend), annualizedSavings: round(totals.annualizedSavings), savingsPct: totals.actualSpend > 0 ? round((totals.savings / totals.actualSpend) * 100, 1) : 0 },
      minDate: dates[0] || "", maxDate: dates[dates.length - 1] || "",
    };
  }

  // Savings realization snapshots (populated from the database).
  const SNAPSHOTS = [];

  // Current savings funnel: identified -> approved -> implemented (realized),
  // derived from each SKU's positive annual savings and implementation status.
  function savingsFunnel() {
    const pos = (s) => Math.max(0, +s.annualSavings || 0);
    let identified = 0, inReview = 0, approved = 0, realized = 0;
    const catR = {}, shopR = {};
    SKUS.forEach((s) => {
      const v = pos(s); if (v <= 0) return;
      identified += v;
      const st = s.implementationStatus;
      if (st === "In Review") inReview += v;
      if (st === "Approved" || st === "Implemented") approved += v;
      if (st === "Implemented") {
        realized += v;
        const g = s.categoryGroup || "Other"; catR[g] = (catR[g] || 0) + v;
        const sh = s.shop || s.shopCode || "—"; shopR[sh] = (shopR[sh] || 0) + v;
      }
    });
    return {
      identified: round(identified), inReview: round(inReview), approved: round(approved), realized: round(realized),
      remaining: round(identified - realized),
      capturedPct: identified > 0 ? round(realized / identified * 100, 1) : 0,
      approvedPct: identified > 0 ? round(approved / identified * 100, 1) : 0,
      byCategory: Object.keys(catR).map((k) => ({ name: k, value: round(catR[k]) })).sort((a, b) => b.value - a.value),
      byShop: Object.keys(shopR).map((k) => ({ name: k, value: round(shopR[k]) })).sort((a, b) => b.value - a.value),
      baseline: round(aggregate(SKUS).baselineSpend),
    };
  }

  // Weekly market-intelligence briefings (populated from the database).
  const MARKET = [];
  // Monday (ISO week start) of the date as YYYY-MM-DD — the briefing's week key.
  function weekOf(d) {
    const dt = d ? new Date(d) : new Date();
    const day = (dt.getDay() + 6) % 7; // 0 = Monday
    dt.setDate(dt.getDate() - day);
    return dt.toISOString().slice(0, 10);
  }

  // Aggregate AP into calendar-month seasonality (Jan–Dec across all years) and
  // a chronological trend, optionally filtered to one shop.
  function apSummary(shop) {
    const rows = AP.filter((r) => r.date && (!shop || shop === "All" || r.shop === shop));
    const total = round(rows.reduce((a, r) => a + r.amount, 0));
    const byCalMonth = Array(12).fill(0);
    rows.forEach((r) => { if (r.monthIndex >= 0) byCalMonth[r.monthIndex] += r.amount; });
    const groups = {};
    rows.forEach((r) => {
      const g = groups[r.categoryGroup] || (groups[r.categoryGroup] = { total: 0, m: Array(12).fill(0) });
      g.total += r.amount; if (r.monthIndex >= 0) g.m[r.monthIndex] += r.amount;
    });
    const categories = Object.keys(groups).map((name) => {
      const g = groups[name]; let peak = -1, pv = -1;
      g.m.forEach((v, i) => { if (v > pv) { pv = v; peak = i; } });
      return { group: name, total: round(g.total), byCalMonth: g.m.map((x) => round(x)), peakMonth: peak, peakValue: round(pv) };
    }).sort((a, b) => b.total - a.total);
    const ymMap = {};
    rows.forEach((r) => { if (r.ym) ymMap[r.ym] = (ymMap[r.ym] || 0) + r.amount; });
    const trend = Object.keys(ymMap).sort().map((k) => ({ ym: k, amount: round(ymMap[k]) }));
    let peakMonth = -1, pmv = -1;
    byCalMonth.forEach((v, i) => { if (v > pmv) { pmv = v; peakMonth = i; } });
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    return { rows: rows.length, total, byCalMonth: byCalMonth.map((x) => round(x)), categories, trend, peakMonth, minDate: dates[0] || "", maxDate: dates[dates.length - 1] || "" };
  }

  /* ------------------------- Vendor master ------------------------- */
  const VENDOR_CATEGORIES = [
    "PMS & Operations Software", "Revenue Management", "Marketing & Advertising",
    "Finance & Accounting", "Payments", "HR, Benefits & PEO", "Legal & Compliance",
    "IT, Telecom & Hardware", "Smart Home & Access", "Cleaning & Housekeeping",
    "Linen, Laundry & Supplies", "Supplies & Equipment", "Construction & Maintenance",
    "Staffing & Consulting", "Data & Analytics", "Insurance", "Other",
  ];
  const VENDORS_DB = []; // managed vendor master, loaded from the database

  function vendorMaster() { return VENDORS_DB.slice().sort((a, b) => a.name.localeCompare(b.name)); }
  function vendorsByCategory() {
    const m = {};
    vendorMaster().forEach((v) => { (m[v.category || "Other"] = m[v.category || "Other"] || []).push(v); });
    return m;
  }
  function nextVendorId() {
    let n = VENDORS_DB.length + 1, id;
    do { id = "VEN-" + String(n++).padStart(3, "0"); } while (VENDORS_DB.some((v) => v.id === id));
    return id;
  }
  // Resolve any raw vendor string to a master vendor name (exact, alias, then
  // fuzzy) so AP/contract spend consolidates onto one canonical vendor.
  function canonicalVendor(raw) {
    const r = normName(raw); if (!r) return null;
    const exact = VENDORS_DB.find((v) => normName(v.name) === r || (v.aliases || []).some((a) => normName(a) === r));
    if (exact) return exact.name;
    let best = null, score = 0;
    VENDORS_DB.forEach((v) => {
      [v.name].concat(v.aliases || []).forEach((c) => { const s = similarity(r, normName(c)); if (s > score) { score = s; best = v; } });
    });
    return best && score >= 0.8 ? best.name : null;
  }
  // Add or merge a vendor (consolidates onto an existing name/alias match).
  function addVendorRecord(f) {
    const name = String(f.name || "").trim(); if (!name) return null;
    const existing = VENDORS_DB.find((v) => normName(v.name) === normName(name) || (v.aliases || []).some((a) => normName(a) === normName(name)));
    if (existing) {
      if (f.category) existing.category = f.category;
      if (f.notes) existing.notes = f.notes;
      return existing;
    }
    const rec = { id: f.id || nextVendorId(), name, category: f.category || "Other", aliases: Array.isArray(f.aliases) ? f.aliases : [], notes: f.notes || "", status: f.status || "Active" };
    VENDORS_DB.push(rec);
    return rec;
  }
  function removeVendorRecord(id) { const i = VENDORS_DB.findIndex((v) => v.id === id); if (i >= 0) VENDORS_DB.splice(i, 1); }
  // Names not already in the vendor master (by exact/alias/fuzzy match) — drives
  // the "confirm before adding a new vendor" prompt.
  function newVendorsAmong(names) {
    const out = [], seen = new Set();
    (names || []).forEach((n) => {
      const t = String(n || "").trim(); if (!t) return;
      const k = normName(t); if (seen.has(k)) return; seen.add(k);
      if (!canonicalVendor(t)) out.push(t);
    });
    return out;
  }
  // Distinct recommended vendors a shop could move to for a given sub-category
  // (a menu of options, not a forced choice).
  function vendorOptionsForSub(subcategory) {
    const set = new Set();
    SKUS.forEach((s) => { if ((s.subcategory || "") === subcategory && s.recommendedVendor && s.recommendedVendor !== "—") set.add(s.recommendedVendor); });
    return Array.from(set).sort();
  }
  // Bulk import vendors from a header+rows matrix (Vendor/Name, Category, Notes).
  function ingestVendorRows(matrix) {
    if (!matrix || !matrix.length) return { added: 0 };
    const header = matrix[0].map((h) => String(h == null ? "" : h).trim().toLowerCase());
    const find = (names) => { for (const n of names) { const i = header.findIndex((h) => h === n || h.includes(n)); if (i >= 0) return i; } return -1; };
    const ni = find(["vendor", "name", "supplier", "payee"]);
    const ci = find(["category", "type", "group"]);
    const noi = find(["notes", "note", "description"]);
    let added = 0;
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r]; if (!row) continue;
      const name = String((ni >= 0 ? row[ni] : row[0]) || "").trim();
      if (!name) continue;
      const cat = ci >= 0 ? String(row[ci] || "").trim() : "";
      if (addVendorRecord({ name, category: cat || "Other", notes: noi >= 0 ? String(row[noi] || "").trim() : "" })) added++;
    }
    return { added };
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
    CONTRACTS,
    AP,
    MONTHS,
    AP_TEMPLATE_COLUMNS,
    makeApRow,
    ingestApRows,
    ingestApItems,
    apSummary,
    apShops,
    apShopSavings,
    apSavingsAll,
    apVendorSummary,
    apVendors,
    apPriceDiscrepancies,
    priceCompliance,
    VENDOR_CATEGORIES,
    VENDORS_DB,
    vendorMaster,
    vendorsByCategory,
    canonicalVendor,
    addVendorRecord,
    removeVendorRecord,
    ingestVendorRows,
    nextVendorId,
    unmatchedApShops,
    remapApShop,
    fuzzyShop,
    apClear,
    MARKET,
    SNAPSHOTS,
    savingsFunnel,
    weekOf,
    importContract,
    deleteContract,
    publishContractToCatalog,
    contractsByVendor,
    vendorDuplicates,
    nextContractId,
    aggregate,
    categories,
    categoryGroupOf,
    categoryGroups,
    categoriesInGroup,
    matchContractToSkus,
    dataQuality,
    subcategoriesFor,
    shops,
    setScope,
    getScope,
    scopedSkus,
    scopedShops,
    upsertBrand,
    nextBrandCode,
    nextSkuId,
    makeSku,
    ensureBrand,
    importRecords,
    importShopByShopWorkbook,
    cleanVendorName,
    newVendorsAmong,
    vendorOptionsForSub,
    updateSku,
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
