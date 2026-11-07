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
