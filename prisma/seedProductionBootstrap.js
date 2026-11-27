require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

const seedProduction = async () => {
  console.log("Starting Production Database Bootstrap...");

  // 1. Seed Default Branches
  console.log("1. Seeding Branches...");
  const mainBranch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: { name: "Branch 1", status: "ACTIVE" },
    create: { code: "MAIN", name: "Branch 1", status: "ACTIVE" },
  });
  console.log(`- Branch MAIN: ${mainBranch.id}`);

  const mabBranch = await prisma.branch.upsert({
    where: { code: "MAB" },
    update: { name: "Branch 2", status: "ACTIVE" },
    create: { code: "MAB", name: "Branch 2", status: "ACTIVE" },
  });
  console.log(`- Branch MAB: ${mabBranch.id}`);

  // 2. Seed Default Super Owner & Admin
  console.log("2. Seeding Super Owner & Admin Users...");
  const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const superOwner = await prisma.user.upsert({
    where: { username: "superowner" },
    update: {
      role: "SUPER_OWNER",
      status: "ACTIVE",
      passwordHash,
    },
    create: {
      username: "superowner",
      firstName: "Super",
      lastName: "Owner",
      fullName: "Super Owner",
      employeeCode: "EMP-0001",
      role: "SUPER_OWNER",
      status: "ACTIVE",
      passwordHash,
    },
  });
  console.log(`- User superowner: ${superOwner.id}`);

  const mainAdmin = await prisma.user.upsert({
    where: { username: "mainadmin" },
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      branchId: mainBranch.id,
      passwordHash,
    },
    create: {
      username: "mainadmin",
      email: "mainadmin@arunafeltz.local",
      firstName: "Main",
      lastName: "Admin",
      fullName: "Main Branch Admin",
      employeeCode: "EMP-0002",
      role: "ADMIN",
      status: "ACTIVE",
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  console.log(`- User mainadmin: ${mainAdmin.id}`);

  // 2b. Seed Demo Recruiter / Evaluator Accounts
  const demoPasswordHash = await bcrypt.hash("password123", 10);
  const demoSuperOwner = await prisma.user.upsert({
    where: { username: "joshua.parungao" },
    update: {
      role: "SUPER_OWNER",
      status: "ACTIVE",
      passwordHash: demoPasswordHash,
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
      passwordHash: demoPasswordHash,
    },
  });
  console.log(`- Demo Super Owner: ${demoSuperOwner.username} (${demoSuperOwner.id})`);

  const demoCashier = await prisma.user.upsert({
    where: { username: "kyle.musngi" },
    update: {
      role: "CASHIER",
      status: "ACTIVE",
      branchId: mainBranch.id,
      passwordHash: demoPasswordHash,
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
      branchId: mainBranch.id,
      passwordHash: demoPasswordHash,
    },
  });
  console.log(`- Demo Cashier: ${demoCashier.username} (${demoCashier.id})`);

  console.log("3. Seeding Default Business Settings...");
  const { execSync } = require("child_process");
  const seeds = [
    "prisma/seedBusinessSettings.js",
    "prisma/seedDocumentNumbering.js",
    "prisma/seedPaymentSettings.js",
    "prisma/seedPriceTierLabels.js",
    "prisma/seedDiscountRules.js",
    "prisma/seedServiceRules.js",
    "prisma/seedIncentiveRules.js",
    "prisma/seedInventoryRules.js",
    "prisma/seedItemCatalog.js",
    "prisma/seedCustomers.js",
    "phase10-module2-seed-default-cash-boxes.js",
  ];

  for (const s of seeds) {
    try {
      execSync(`node ${s}`, { stdio: "inherit" });
    } catch (e) {
      console.warn(`Seed note (${s}):`, e.message);
    }
  }

  console.log("Production Bootstrap Completed Successfully! 🎉");
};

seedProduction()
  .catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
