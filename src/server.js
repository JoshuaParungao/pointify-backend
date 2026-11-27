const app = require("./app");
const env = require("./config/env");
const logger = require("./utils/logger");
const prisma = require("./config/prisma");
const { initBackupScheduler } = require("./modules/backup/services/backupScheduler.service");
const { ensureDefaultSettings } = require("./modules/settings/services/setting.service");
const bcrypt = require("bcryptjs");

const ensureSchemaMigrations = async () => {
  const migrations = [
    `ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "warrantyDuration" TEXT;`,
    `ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "warrantyDuration" TEXT;`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleRatePercent" DECIMAL(7,4);`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildRatePercent" DECIMAL(7,4);`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "ordinaryPartsRepairEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "ordinaryPartsRepairRatePercent" DECIMAL(7,4);`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "boardPartsRepairEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "boardPartsRepairRatePercent" DECIMAL(7,4);`,
    `ALTER TABLE "ServiceJob" DROP CONSTRAINT IF EXISTS "ServiceJob_financial_snapshot_check";`,
    `ALTER TABLE "ServiceJob" DROP CONSTRAINT IF EXISTS "ServiceJob_service_pricing_check";`,
  ];

  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      logger.warn("Database schema migration statement warning", { sql, error: err.message });
    }
  }
  logger.info("Database schema self-check completed");
};

const ensureDefaultBranches = async () => {
  try {
    const branches = await prisma.branch.findMany();
    for (const b of branches) {
      const code = String(b.code || b.name || "").toUpperCase();
      if (code.includes("MAIN") || code.includes("SAN FERNANDO")) {
        await prisma.branch.update({
          where: { id: b.id },
          data: {
            name: "Branch 1",
            address: "Branch 1 Commercial Center, Main District",
            contactNo: "0961-000-0001",
          },
        });
      } else if (code.includes("MAB") || code.includes("DAU")) {
        await prisma.branch.update({
          where: { id: b.id },
          data: {
            name: "Branch 2",
            address: "Branch 2 Commercial Center, City District",
            contactNo: "0961-000-0002",
          },
        });
      }
    }
    logger.info("Default branches verified as Branch 1 & Branch 2");
  } catch (err) {
    logger.warn("Default branches sync warning", { error: err.message });
  }
};

const ensureDeveloperAccount = async () => {
  try {
    const existingSuperOwner = await prisma.user.findFirst({
      where: {
        role: "SUPER_OWNER",
      },
    });

    if (existingSuperOwner) {
      logger.info("Main Admin (SUPER_OWNER) account already exists; preserving user credentials");
      return;
    }

    const username = "calix";
    const plainPassword = "calixdaven";
    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: "calix" },
          { email: "calix@posynctify.local" }
        ]
      }
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: "calix",
          firstName: "Calix",
          lastName: "Developer",
          fullName: "Calix",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
          branchId: null,
        }
      });
      logger.info("Developer account calix verified/updated");
    } else {
      await prisma.user.create({
        data: {
          username: "calix",
          email: "calix@posynctify.local",
          firstName: "Calix",
          lastName: "Developer",
          fullName: "Calix",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
          branchId: null,
        }
      });
      logger.info("Developer account calix created successfully");
    }
  } catch (err) {
    logger.warn("Developer account sync warning", { error: err.message });
  }
};

const ensureDemoAccounts = async () => {
  try {
    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Get or create default branch for cashier assignment
    let defaultBranch = await prisma.branch.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });

    if (!defaultBranch) {
      defaultBranch = await prisma.branch.create({
        data: {
          code: "MAIN",
          name: "Branch 1",
          status: "ACTIVE",
          address: "Branch 1 Commercial Center, Main District",
          contactNo: "0961-000-0001",
        },
      });
    }

    // 2. Ensure Super Owner: joshua.parungao (also accepts Joshua Parungao)
    const existingJoshua = await prisma.user.findFirst({
      where: {
        OR: [
          { username: "joshua.parungao" },
          { username: "joshua" },
          { email: "joshua@posynctify.cloud" },
        ],
      },
    });

    if (existingJoshua) {
      await prisma.user.update({
        where: { id: existingJoshua.id },
        data: {
          username: "joshua.parungao",
          email: "joshua@posynctify.cloud",
          firstName: "Joshua",
          lastName: "Parungao",
          fullName: "Joshua Parungao",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
        },
      });
      logger.info("Demo Super Owner account (joshua.parungao) verified/updated");
    } else {
      await prisma.user.create({
        data: {
          username: "joshua.parungao",
          email: "joshua@posynctify.cloud",
          firstName: "Joshua",
          lastName: "Parungao",
          fullName: "Joshua Parungao",
          employeeCode: "DEMO-001",
          role: "SUPER_OWNER",
          status: "ACTIVE",
          passwordHash,
        },
      });
      logger.info("Demo Super Owner account (joshua.parungao) created successfully");
    }

    // 3. Ensure Cashier: kyle.musngi (also accepts Kyle Musngi)
    const existingKyle = await prisma.user.findFirst({
      where: {
        OR: [
          { username: "kyle.musngi" },
          { username: "kyle" },
          { email: "kyle@posynctify.cloud" },
        ],
      },
    });

    if (existingKyle) {
      await prisma.user.update({
        where: { id: existingKyle.id },
        data: {
          username: "kyle.musngi",
          email: "kyle@posynctify.cloud",
          firstName: "Kyle",
          lastName: "Musngi",
          fullName: "Kyle Musngi",
          role: "CASHIER",
          status: "ACTIVE",
          branchId: defaultBranch.id,
          passwordHash,
        },
      });
      logger.info("Demo Cashier account (kyle.musngi) verified/updated");
    } else {
      await prisma.user.create({
        data: {
          username: "kyle.musngi",
          email: "kyle@posynctify.cloud",
          firstName: "Kyle",
          lastName: "Musngi",
          fullName: "Kyle Musngi",
          employeeCode: "DEMO-002",
          role: "CASHIER",
          status: "ACTIVE",
          branchId: defaultBranch.id,
          passwordHash,
        },
      });
      logger.info("Demo Cashier account (kyle.musngi) created successfully");
    }
  } catch (err) {
    logger.warn("Demo accounts sync warning", { error: err.message });
  }
};

const server = app.listen(env.port, () => {
  logger.info("POSynctify Backend API started", {
    port: env.port,
    environment: env.nodeEnv,
  });
  initBackupScheduler();
  ensureSchemaMigrations();
  ensureDeveloperAccount();
  ensureDemoAccounts();
  ensureDefaultBranches();
  ensureDefaultSettings().catch((err) => {
    logger.warn("Initial settings sync warning", { error: err.message });
  });
  try {
    const { restoreUserEditsFromAuditLog } = require("./utils/restoreUserEdits");
    restoreUserEditsFromAuditLog().catch((err) => {
      logger.warn("Initial audit log user edits restoration warning", { error: err.message });
    });
  } catch (err) {
    logger.warn("Could not load restoreUserEdits helper", { error: err.message });
  }
  try {
    const { cleanupExpiredQuotations } = require("./modules/quotations/services/quotation.service");
    cleanupExpiredQuotations().catch((err) => {
      logger.warn("Initial quotation cleanup warning", { error: err.message });
    });
    const quotationCleanupInterval = setInterval(() => {
      cleanupExpiredQuotations().catch(() => {});
    }, 12 * 60 * 60 * 1000);
    quotationCleanupInterval.unref();
  } catch (err) {
    logger.warn("Could not initialize quotation cleanup scheduler", { error: err.message });
  }
});

let isShuttingDown = false;

const shutdown = (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Backend shutdown started", { signal });

  const forceTimer = setTimeout(() => {
    logger.error("Backend shutdown timed out", { signal });
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async (closeError) => {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error("Database disconnect failed", { message: disconnectError.message });
      exitCode = 1;
    }

    if (closeError) {
      logger.error("HTTP server close failed", { message: closeError.message });
      exitCode = 1;
    }
    process.exit(exitCode);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", {
    message: error.message,
    stack: error.stack,
  });

  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });

  process.exit(1);
});
