const prisma = require("../config/prisma");
const logger = require("./logger");
const path = require("path");
const fs = require("fs");

const MEDICAL_DEVICES = [
  // Therapeutic Devices / Equipment (SUB-DEV-THR)
  {
    itemCode: "DEV-THR-NEB01",
    itemName: "Nebulizer",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 1200,
    price1: 1850,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 15,
  },
  {
    itemCode: "DEV-THR-CPAP01",
    itemName: "CPAP Machine (Continuous Positive Airway Pressure)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 28000,
    price1: 39500,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 5,
  },
  {
    itemCode: "DEV-THR-BIPAP01",
    itemName: "BiPAP Machine (Bilevel Positive Airway Pressure)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 42000,
    price1: 58000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 4,
  },
  {
    itemCode: "DEV-THR-INFP01",
    itemName: "Infusion Pump / IV Pump",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 18500,
    price1: 26000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 8,
  },
  {
    itemCode: "DEV-THR-PHOT01",
    itemName: "Phototherapy Light (Bili Light)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 22000,
    price1: 31500,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 3,
  },
  {
    itemCode: "DEV-THR-HEMO01",
    itemName: "Hemodialysis Machine",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 450000,
    price1: 580000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "3 YEARS WARRANTY",
    initialStock: 2,
  },
  {
    itemCode: "DEV-THR-TENS01",
    itemName: "TENS Machine (Transcutaneous Electrical Nerve Stimulation)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 1800,
    price1: 2850,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 12,
  },
  {
    itemCode: "DEV-THR-OXYC01",
    itemName: "Oxygen Concentrator (Static or Portable)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 24000,
    price1: 34500,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 6,
  },
  {
    itemCode: "DEV-THR-SUCT01",
    itemName: "Suction Machine / Aspirator",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 5500,
    price1: 8200,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 10,
  },
  {
    itemCode: "DEV-THR-OXIM01",
    itemName: "Pulse Oximeter (Professional / Clinical Grade)",
    subCategoryCode: "SUB-DEV-THR",
    baseUnit: "UNIT",
    costPrice: 650,
    price1: 1250,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 25,
  },

  // Life-Support Equipment (SUB-DEV-LIF)
  {
    itemCode: "DEV-LIF-VENT01",
    itemName: "Mechanical Ventilator",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "UNIT",
    costPrice: 380000,
    price1: 495000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "3 YEARS WARRANTY",
    initialStock: 2,
  },
  {
    itemCode: "DEV-LIF-ECMO01",
    itemName: "ECMO Machine (Extracorporeal Membrane Oxygenation / Heart-Lung Machine)",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "UNIT",
    costPrice: 1200000,
    price1: 1550000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "3 YEARS WARRANTY",
    initialStock: 1,
  },
  {
    itemCode: "DEV-LIF-AEDB01",
    itemName: "Defibrillator (Manual / AED - Automated External Defibrillator)",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "UNIT",
    costPrice: 65000,
    price1: 89000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 4,
  },
  {
    itemCode: "DEV-LIF-INCB01",
    itemName: "Infant Incubator",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "UNIT",
    costPrice: 180000,
    price1: 245000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 2,
  },
  {
    itemCode: "DEV-LIF-ANES01",
    itemName: "Anesthesia Machine",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "UNIT",
    costPrice: 520000,
    price1: 680000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "3 YEARS WARRANTY",
    initialStock: 1,
  },
  {
    itemCode: "DEV-LIF-CART01",
    itemName: "Crash Cart / Resuscitation Cart (Complete Emergency Kit)",
    subCategoryCode: "SUB-DEV-LIF",
    baseUnit: "SET",
    costPrice: 35000,
    price1: 48500,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 5,
  },

  // Durable Medical Equipment (DME) / Mobility & Patient Care (SUB-DEV-DME)
  {
    itemCode: "DEV-DME-WCHR01",
    itemName: "Standard Wheelchair (Manual / Self-propelled)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 3200,
    price1: 4800,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 15,
  },
  {
    itemCode: "DEV-DME-TWCH01",
    itemName: "Transport Wheelchair (Lightweight / Companion-propelled)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 3800,
    price1: 5600,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 10,
  },
  {
    itemCode: "DEV-DME-EWCH01",
    itemName: "Motorized / Electric Wheelchair",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 28000,
    price1: 42000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 4,
  },
  {
    itemCode: "DEV-DME-MBED01",
    itemName: "Manual Hospital Bed (2-crank or 3-crank with side rails)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 14500,
    price1: 21500,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 8,
  },
  {
    itemCode: "DEV-DME-EBED01",
    itemName: "Electric Hospital Bed (Remote-controlled motorized bed)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 38000,
    price1: 54000,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 5,
  },
  {
    itemCode: "DEV-DME-OTAB01",
    itemName: "Overbed Table (Adjustable table for patient meals/use)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 2200,
    price1: 3400,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "6 MONTHS WARRANTY",
    initialStock: 12,
  },
  {
    itemCode: "DEV-DME-AMAT01",
    itemName: "Anti-Decubitus Mattress (Air mattress / Ripple mattress for bedsore prevention)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "SET",
    costPrice: 1800,
    price1: 2950,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 20,
  },
  {
    itemCode: "DEV-DME-WLKR01",
    itemName: "Patient Walker (Standard / Rollator with wheels)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 1200,
    price1: 1950,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "1 YEAR WARRANTY",
    initialStock: 16,
  },
  {
    itemCode: "DEV-DME-CRTC01",
    itemName: "Medical Crutches (Axillary / Forearm crutches)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "PAIR",
    costPrice: 650,
    price1: 1100,
    isSerialized: false,
    hasWarranty: true,
    warrantyDuration: "6 MONTHS WARRANTY",
    initialStock: 20,
  },
  {
    itemCode: "DEV-DME-LIFT01",
    itemName: "Patient Hoyer Lift (Hydraulic or electric lift for transferring patients)",
    subCategoryCode: "SUB-DEV-DME",
    baseUnit: "UNIT",
    costPrice: 32000,
    price1: 46500,
    isSerialized: true,
    hasWarranty: true,
    warrantyDuration: "2 YEARS WARRANTY",
    initialStock: 3,
  },
];

const TAXONOMY_STRUCTURE = [
  {
    code: "CAT-DEV",
    name: "Medical Devices",
    description: "Clinical, therapeutic, life-support, and durable medical mobility equipment",
    subcategories: [
      { code: "SUB-DEV-THR", name: "Therapeutic Devices / Equipment", description: "Nebulizers, CPAP, Infusion pumps, phototherapy, dialyzers" },
      { code: "SUB-DEV-LIF", name: "Life-Support Equipment", description: "Ventilators, ECMO, Defibrillators, incubators, anesthesia machines" },
      { code: "SUB-DEV-DME", name: "Durable Medical Equipment (DME) / Mobility & Patient Care", description: "Wheelchairs, hospital beds, walkers, crutches, patient lifts" },
    ],
  },
  {
    code: "CAT-MED",
    name: "Medicines & Pharmaceuticals",
    description: "Prescription drugs, over-the-counter pharmaceuticals, and therapeutic medications",
    subcategories: [
      { code: "SUB-MED-RESP", name: "Respiratory Drugs", description: "Inhalers, nebules, bronchodilators, pulmonary agents" },
      { code: "SUB-MED-ANTI", name: "Anti-Infective Drugs", description: "Antibiotics, antivirals, antifungals, antiparasitics" },
      { code: "SUB-MED-CARD", name: "Cardiovascular Drugs", description: "Antihypertensives, beta-blockers, cardiac medications" },
      { code: "SUB-MED-ANAL", name: "Analgesic & Pain Management", description: "NSAIDs, antipyretics, pain relief medicines" },
      { code: "SUB-MED-GAST", name: "Gastrointestinal Drugs", description: "Antacids, proton-pump inhibitors, digestive agents" },
      { code: "SUB-MED-VITA", name: "Vitamins & Minerals", description: "Nutritional supplements, multi-vitamins, mineral complexes" },
      { code: "SUB-MED-ENDO", name: "Endocrine Drugs", description: "Antidiabetic, thyroid, hormonal therapeutics" },
      { code: "SUB-MED-CNS", name: "CNS Drugs", description: "Central nervous system, neurologics, psychotropics" },
      { code: "SUB-MED-TOPI", name: "Topical Preparation", description: "Ointments, creams, dermatological preparations" },
      { code: "SUB-MED-EYE", name: "Eye Preparations", description: "Ophthalmic drops, ointments, eye solutions" },
      { code: "SUB-MED-EAR", name: "Ear Preparations", description: "Otic drops, ear care solutions" },
      { code: "SUB-MED-NASA", name: "Nasal Preparations", description: "Nasal sprays, decongestants, saline mists" },
      { code: "SUB-MED-LIPID", name: "Antihyperlipidemic", description: "Statins, cholesterol and lipid-lowering agents" },
      { code: "SUB-MED-GENI", name: "Genito-Urinary Drugs", description: "Urological and reproductive health medications" },
      { code: "SUB-MED-IMMU", name: "Immunologic Drugs", description: "Immunosuppressants, immunomodulators, vaccines" },
    ],
  },
  {
    code: "CAT-SUP",
    name: "Medical Supplies & Consumables",
    description: "Syringes, bandages, IV sets, cotton, gloves, diagnostic strips and clinic consumables",
    subcategories: [
      { code: "SUB-SUP-GEN", name: "Medical Supplies & Disposables", description: "Standard medical consumables, wound care, and clinic supplies" },
    ],
  },
  {
    code: "CAT-BUN",
    name: "Packages & Bundles",
    description: "Pre-packaged medical kits and product combinations",
    subcategories: [
      { code: "SUB-BUN-GEN", name: "Product Bundles", description: "Bundled items, medical kits, and treatment sets" },
    ],
  },
];

const STANDARD_UNITS = [
  { code: "PCS", name: "Piece", description: "Individual single item" },
  { code: "BOX", name: "Box", description: "Packaged box of pieces" },
  { code: "UNIT", name: "Unit", description: "Single equipment unit" },
  { code: "SET", name: "Set", description: "Complete package or assembly" },
  { code: "PAIR", name: "Pair", description: "Pair of two matching items" },
  { code: "BOTTLE", name: "Bottle", description: "Liquid or tablet bottle" },
  { code: "TUBE", name: "Tube", description: "Ointment or cream tube" },
  { code: "VIAL", name: "Vial", description: "Injectable liquid vial" },
];

async function importPharmacyAndDeviceCatalog() {
  logger.info("[CatalogImporter] Checking pharmacy & medical device catalog import status...");

  const branches = await prisma.branch.findMany({ where: { status: "ACTIVE" } });
  if (!branches || branches.length === 0) {
    logger.warn("[CatalogImporter] No active branches found. Skipping catalog import.");
    return { success: false, reason: "NO_ACTIVE_BRANCHES" };
  }

  // Load pharmacy catalog JSON
  const jsonPath = path.join(__dirname, "../data/pharmacyCatalogData.json");
  let pharmacyProducts = [];
  if (fs.existsSync(jsonPath)) {
    try {
      pharmacyProducts = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      logger.info(`[CatalogImporter] Loaded ${pharmacyProducts.length} pharmacy products from JSON.`);
    } catch (err) {
      logger.error("[CatalogImporter] Failed to parse pharmacyCatalogData.json:", err);
    }
  } else {
    logger.warn(`[CatalogImporter] ${jsonPath} not found.`);
  }

  let totalDevicesUpserted = 0;
  let totalPharmacyImported = 0;
  let totalBatchesCreated = 0;

  for (const branch of branches) {
    logger.info(`[CatalogImporter] Processing catalog for branch: ${branch.name} (${branch.code})...`);

    // 1. Ensure Standard Units
    const unitMap = new Map();
    for (const u of STANDARD_UNITS) {
      let existing = await prisma.unit.findFirst({
        where: { branchId: branch.id, code: u.code },
      });
      if (!existing) {
        existing = await prisma.unit.create({
          data: {
            branchId: branch.id,
            code: u.code,
            name: u.name,
            description: u.description,
          },
        });
      }
      unitMap.set(u.code, existing);
    }
    const defaultUnit = unitMap.get("PCS") || unitMap.get("UNIT");

    // 2. Ensure Categories and Subcategories
    const categoryMap = new Map();
    for (const parentCat of TAXONOMY_STRUCTURE) {
      let parentRecord = await prisma.itemCategory.findFirst({
        where: { branchId: branch.id, categoryCode: parentCat.code },
      });
      if (!parentRecord) {
        parentRecord = await prisma.itemCategory.create({
          data: {
            branchId: branch.id,
            categoryCode: parentCat.code,
            name: parentCat.name,
            description: parentCat.description,
            status: "ACTIVE",
          },
        });
      }
      categoryMap.set(parentCat.code, parentRecord);

      // Create Subcategories
      for (const sub of parentCat.subcategories) {
        let subRecord = await prisma.itemCategory.findFirst({
          where: { branchId: branch.id, categoryCode: sub.code },
        });
        if (!subRecord) {
          subRecord = await prisma.itemCategory.create({
            data: {
              branchId: branch.id,
              parentId: parentRecord.id,
              categoryCode: sub.code,
              name: sub.name,
              description: sub.description,
              status: "ACTIVE",
            },
          });
        }
        categoryMap.set(sub.code, subRecord);
      }
    }

    // 3. Import / Upsert Medical Devices (26 Items)
    logger.info(`[CatalogImporter] Upserting 26 Medical Devices for branch ${branch.code}...`);
    for (const dev of MEDICAL_DEVICES) {
      const targetSubCat = categoryMap.get(dev.subCategoryCode);
      const targetUnit = unitMap.get(dev.baseUnit) || defaultUnit;

      let item = await prisma.item.findFirst({
        where: { branchId: branch.id, itemCode: dev.itemCode },
      });

      if (!item) {
        const desc = dev.warrantyDuration
          ? `${dev.itemName} [WARRANTY: ${dev.warrantyDuration}]`
          : dev.itemName;

        item = await prisma.item.create({
          data: {
            branchId: branch.id,
            categoryId: targetSubCat ? targetSubCat.id : categoryMap.get("SUB-DEV-THR").id,
            unitId: targetUnit.id,
            itemCode: dev.itemCode,
            itemName: dev.itemName,
            description: desc,
            costPrice: dev.costPrice,
            price1: dev.price1,
            price2: dev.price1,
            price3: dev.price1,
            price4: dev.price1,
            price5: dev.price1,
            isSerialized: dev.isSerialized,
            hasWarranty: dev.hasWarranty,
            status: "ACTIVE",
          },
        });
        totalDevicesUpserted++;

        // Create opening inventory batch
        if (dev.initialStock > 0) {
          await prisma.inventoryBatch.create({
            data: {
              branchId: branch.id,
              itemId: item.id,
              batchCode: `INIT-${dev.itemCode}`,
              quantityIn: dev.initialStock,
              quantityAvailable: dev.initialStock,
              unitCost: dev.costPrice,
              sellingPrice1: dev.price1,
              status: "ACTIVE",
              remarks: "Initial opening stock for medical equipment",
            },
          });
          totalBatchesCreated++;
        }
      }
    }

    // 4. Import / Upsert Pharmacy Products (1,110 Items)
    if (pharmacyProducts.length > 0) {
      logger.info(`[CatalogImporter] Upserting ${pharmacyProducts.length} pharmacy products for branch ${branch.code}...`);

      for (const prod of pharmacyProducts) {
        const targetSubCat = categoryMap.get(prod.subCategoryCode) || categoryMap.get("SUB-MED-RESP");
        const targetUnit = unitMap.get(prod.baseUnit) || defaultUnit;

        let itemRecord = await prisma.item.findFirst({
          where: { branchId: branch.id, itemCode: prod.itemCode },
        });

        if (!itemRecord) {
          itemRecord = await prisma.item.create({
            data: {
              branchId: branch.id,
              categoryId: targetSubCat.id,
              unitId: targetUnit.id,
              itemCode: prod.itemCode,
              itemName: prod.itemName,
              barcode: prod.barcode || null,
              costPrice: prod.costPrice,
              price1: prod.price1,
              price2: prod.price1,
              price3: prod.price1,
              price4: prod.price1,
              price5: prod.price1,
              status: prod.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
              isSerialized: false,
              hasWarranty: false,
            },
          });
          totalPharmacyImported++;

          // Create inventory batches if any
          if (prod.batches && prod.batches.length > 0) {
            for (const b of prod.batches) {
              const expDate = b.expiryDate ? new Date(b.expiryDate) : null;
              const recDate = b.receivedAt ? new Date(b.receivedAt) : new Date();

              await prisma.inventoryBatch.create({
                data: {
                  branchId: branch.id,
                  itemId: itemRecord.id,
                  batchCode: b.batchCode,
                  quantityIn: b.quantity,
                  quantityAvailable: b.quantity,
                  unitCost: b.costPrice,
                  sellingPrice1: prod.price1,
                  expiryDate: expDate && !isNaN(expDate.getTime()) ? expDate : null,
                  receivedAt: recDate && !isNaN(recDate.getTime()) ? recDate : new Date(),
                  status: "ACTIVE",
                  remarks: "Imported from legacy POS database",
                },
              });
              totalBatchesCreated++;
            }
          }
        }
      }
    }
  }

  logger.info(`[CatalogImporter] Completed! Devices: ${totalDevicesUpserted}, Pharmacy: ${totalPharmacyImported}, Batches: ${totalBatchesCreated}`);
  return {
    success: true,
    devicesUpserted: totalDevicesUpserted,
    pharmacyImported: totalPharmacyImported,
    batchesCreated: totalBatchesCreated,
  };
}

module.exports = {
  importPharmacyAndDeviceCatalog,
  MEDICAL_DEVICES,
  TAXONOMY_STRUCTURE,
  STANDARD_UNITS,
};
