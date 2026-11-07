const env = require("../../../config/env");
const { sendSuccess } = require("../../../utils/apiResponse");
const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const asyncHandler = require("../../../utils/asyncHandler");

const getHealthStatus = asyncHandler(async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError("Service database is unavailable", 503, "DATABASE_UNAVAILABLE");
  }

  return sendSuccess(res, {
    message: "Health check successful",
    data: {
      service: "pointify-backend",
      status: "healthy",
      database: "reachable",
      environment: env.nodeEnv,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

const getCatalogStatus = asyncHandler(async (req, res) => {
  const [itemCount, categoryCount, batchCount] = await Promise.all([
    prisma.item.count(),
    prisma.itemCategory.count(),
    prisma.inventoryBatch.count(),
  ]);

  return sendSuccess(res, {
    message: "Catalog status retrieved",
    data: {
      itemCount,
      categoryCount,
      batchCount,
    },
  });
});

const triggerCatalogImport = asyncHandler(async (req, res) => {
  const { importPharmacyAndDeviceCatalog } = require("../../../utils/pharmacyCatalogImporter");
  const result = await importPharmacyAndDeviceCatalog();
  return sendSuccess(res, {
    message: "Catalog import executed",
    data: result,
  });
});

module.exports = {
  getHealthStatus,
  getCatalogStatus,
  triggerCatalogImport,
};
