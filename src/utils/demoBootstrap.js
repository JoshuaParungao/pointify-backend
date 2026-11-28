const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const logger = require("./logger");

const ensureDemoAccounts = async () => {
  try {
    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Get or create default branch
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

    // 2. Upsert Super Owner: joshua.parungao
    const superOwner = await prisma.user.upsert({
      where: { username: "joshua.parungao" },
      update: {
        passwordHash,
        role: "SUPER_OWNER",
        status: "ACTIVE",
        fullName: "Joshua Parungao",
        firstName: "Joshua",
        lastName: "Parungao",
        email: "joshua@posynctify.cloud",
      },
      create: {
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
    logger.info("Demo Super Owner verified/upserted", { username: superOwner.username });

    // 3. Upsert Cashier: kyle.musngi
    const cashier = await prisma.user.upsert({
      where: { username: "kyle.musngi" },
      update: {
        passwordHash,
        role: "CASHIER",
        status: "ACTIVE",
        branchId: defaultBranch.id,
        fullName: "Kyle Musngi",
        firstName: "Kyle",
        lastName: "Musngi",
        email: "kyle@posynctify.cloud",
      },
      create: {
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
    logger.info("Demo Cashier verified/upserted", { username: cashier.username });

    return {
      status: "success",
      accounts: [
        { username: superOwner.username, fullName: superOwner.fullName, role: superOwner.role },
        { username: cashier.username, fullName: cashier.fullName, role: cashier.role },
      ],
    };
  } catch (err) {
    logger.warn("Demo accounts bootstrap warning", { error: err.message });
    return {
      status: "warning",
      error: err.message,
    };
  }
};

module.exports = {
  ensureDemoAccounts,
};
