const prisma = require("../config/prisma");
const logger = require("./logger");

const LEGACY_COMPUTER_CATEGORY_CODES = [
  "CAT-CPU",
  "CAT-MOBO",
  "CAT-RAM",
  "CAT-STORAGE",
  "CAT-GPU",
  "CAT-ACCESSORIES",
  "CAT-PERIPHERALS",
  "CAT-PSU",
  "CAT-CASE",
  "CAT-COOLING",
  "CAT-MONITOR",
  "CAT-NETWORKING",
  "CAT-ACC-CABLE",
  "CAT-ACC-ADAPT",
  "CAT-ACC-HUB",
  "CAT-ACC-CHRG",
  "CAT-ACC-COOL",
  "CAT-ACC-OTH",
  "CAT-CPU-DESK",
  "CAT-CPU-LAP",
  "CAT-CPU-SRV",
  "CAT-GPU-GAME",
  "CAT-GPU-PRO",
  "CAT-GPU-EXT",
  "CAT-MOBO-DESK",
  "CAT-MOBO-SRV",
  "CAT-MOBO-IND",
  "CAT-PERI-KB",
  "CAT-PERI-MOUSE",
  "CAT-PERI-MON",
  "CAT-PERI-HEAD",
  "CAT-PERI-WEB",
  "CAT-PERI-SPK",
  "CAT-PERI-MIC",
  "CAT-PERI-CTRL",
  "CAT-RAM-DESK",
  "CAT-RAM-LAP",
  "CAT-RAM-SRV",
  "CAT-STRG-HDD",
  "CAT-STRG-SSD",
  "CAT-STRG-NVME",
  "CAT-STRG-EHDD",
  "CAT-STRG-ESSD",
  "CAT-STRG-USB",
];

const LEGACY_COMPUTER_ITEM_CODES = [
  "ITEM-MAIN-001",
  "ITEM-MAIN-002",
  "ITEM-MAIN-003",
  "ITEM-MAB-001",
  "ITEM-MAB-002",
  "ITEM-MAIN-API",
  "ITEM-MAIN-API-001",
];

const LEGACY_SERVICE_CATALOG_IDS = new Set([
  "sc-clean-laptop",
  "sc-clean-desktop",
  "sc-format-os",
  "sc-screen-laptop",
  "sc-gpu-repaste",
  "sc-board-power",
  "sc-macbook-liquid",
  "sc-printer-clean",
  "sc-monitor-board",
  "sc-smartphone-lcd",
  "sc-console-clean",
  "sc-pccomponent-diagnosis",
  "sc-pms-general",
  "sc-setup-config",
  "sc-part-install",
  "sc-advanced-overhaul",
  "sc-bench-diagnosis",
]);

const LEGACY_SERVICE_PART_IDS = new Set([
  "sp-lcd-156-slim-30p",
  "sp-lcd-140-slim-30p",
  "sp-thermal-paste-paste",
  "sp-thermal-pad-kit",
  "sp-laptop-battery-std",
  "sp-laptop-keyboard-std",
  "sp-power-ic-chip",
  "sp-dc-jack-port",
  "sp-std-module",
  "sp-maint-consumable",
  "sp-power-unit",
  "sp-precision-part",
]);

async function purgeItemsByIds(itemIds = []) {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (uniqueIds.length === 0) return { deletedCount: 0 };

  try {
    await prisma.itemSerial.deleteMany({
      where: { itemId: { in: uniqueIds } },
    });
  } catch (err) {
    logger.warn("purgeItemsByIds itemSerial cleanup warning", { error: err.message });
  }

  try {
    await prisma.inventoryMovement.deleteMany({
      where: { itemId: { in: uniqueIds } },
    });
  } catch (err) {
    logger.warn("purgeItemsByIds inventoryMovement cleanup warning", { error: err.message });
  }

  try {
    await prisma.inventoryBatch.deleteMany({
      where: { itemId: { in: uniqueIds } },
    });
  } catch (err) {
    logger.warn("purgeItemsByIds inventoryBatch cleanup warning", { error: err.message });
  }

  let deletedCount = 0;
  for (const id of uniqueIds) {
    try {
      await prisma.item.delete({ where: { id } });
      deletedCount += 1;
    } catch {
      try {
        const shortId = String(id).slice(-8).toUpperCase();
        await prisma.item.update({
          where: { id },
          data: {
            itemCode: `__DELETED_${shortId}`,
            itemName: `__DELETED_${shortId}`,
            status: "INACTIVE",
          },
        });
        deletedCount += 1;
      } catch {
        // ignore
      }
    }
  }

  return { deletedCount };
}

async function cleanupLegacyComputerCatalog() {
  try {
    const legacyCategories = await prisma.itemCategory.findMany({
      where: {
        OR: [
          { categoryCode: { in: LEGACY_COMPUTER_CATEGORY_CODES } },
          { categoryCode: { startsWith: "__DELETED_" } },
          { name: { startsWith: "__DELETED_" } },
        ],
      },
      select: { id: true },
    });

    const legacyCategoryIds = legacyCategories.map((c) => c.id);

    const legacyItems = await prisma.item.findMany({
      where: {
        OR: [
          { itemCode: { in: LEGACY_COMPUTER_ITEM_CODES } },
          { itemCode: { startsWith: "__DELETED_" } },
          { itemName: { startsWith: "__DELETED_" } },
          ...(legacyCategoryIds.length > 0 ? [{ categoryId: { in: legacyCategoryIds } }] : []),
        ],
      },
      select: { id: true },
    });

    if (legacyItems.length > 0) {
      await purgeItemsByIds(legacyItems.map((i) => i.id));
    }

    if (legacyCategoryIds.length > 0) {
      await prisma.itemCategory.updateMany({
        where: {
          OR: [
            { id: { in: legacyCategoryIds } },
            { parentId: { in: legacyCategoryIds } },
          ],
        },
        data: { parentId: null },
      });

      for (const catId of legacyCategoryIds) {
        try {
          await prisma.itemCategory.delete({ where: { id: catId } });
        } catch {
          // ignore if still referenced
        }
      }
    }

    logger.info("Legacy computer catalog cleanup completed", {
      removedItems: legacyItems.length,
      removedCategories: legacyCategoryIds.length,
    });

    // Also clean legacy service catalog and service parts catalog entries
    const serviceCatSetting = await prisma.businessSetting.findUnique({
      where: { scopeKey: "GLOBAL:service.catalog" },
    });
    if (serviceCatSetting && Array.isArray(serviceCatSetting.value)) {
      const filteredServices = serviceCatSetting.value.filter(
        (item) => item && !LEGACY_SERVICE_CATALOG_IDS.has(item.id)
      );
      if (filteredServices.length !== serviceCatSetting.value.length) {
        await prisma.businessSetting.update({
          where: { scopeKey: "GLOBAL:service.catalog" },
          data: { value: filteredServices },
        });
      }
    }

    const servicePartsSetting = await prisma.businessSetting.findUnique({
      where: { scopeKey: "GLOBAL:service.parts.catalog" },
    });
    if (servicePartsSetting && Array.isArray(servicePartsSetting.value)) {
      const filteredParts = servicePartsSetting.value.filter(
        (item) => item && !LEGACY_SERVICE_PART_IDS.has(item.id)
      );
      if (filteredParts.length !== servicePartsSetting.value.length) {
        await prisma.businessSetting.update({
          where: { scopeKey: "GLOBAL:service.parts.catalog" },
          data: { value: filteredParts },
        });
      }
    }
  } catch (err) {
    logger.warn("Legacy computer catalog cleanup warning", { error: err.message });
  }
}

module.exports = {
  LEGACY_COMPUTER_CATEGORY_CODES,
  LEGACY_COMPUTER_ITEM_CODES,
  purgeItemsByIds,
  cleanupLegacyComputerCatalog,
};

