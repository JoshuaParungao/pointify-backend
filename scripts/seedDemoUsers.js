require("dotenv").config();
const prisma = require("../src/config/prisma");
const bcrypt = require("bcryptjs");
const authService = require("../src/modules/auth/services/auth.service");

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  let branch = await prisma.branch.findFirst({ where: { status: "ACTIVE" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { code: "MAIN", name: "Branch 1", status: "ACTIVE" }
    });
  }

  // 1. Super Owner
  const superOwner = await prisma.user.upsert({
    where: { username: "joshua.parungao" },
    update: {
      passwordHash,
      role: "SUPER_OWNER",
      status: "ACTIVE",
      fullName: "Joshua Parungao"
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
      passwordHash
    }
  });
  console.log("Registered Super Owner:", superOwner.username);

  // 2. Cashier
  const cashier = await prisma.user.upsert({
    where: { username: "kyle.musngi" },
    update: {
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
      branchId: branch.id,
      fullName: "Kyle Musngi"
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
      branchId: branch.id,
      passwordHash
    }
  });
  console.log("Registered Cashier:", cashier.username);

  // Test Logins
  console.log("\nTesting Auth Service:");
  const login1 = await authService.login({ identifier: "joshua.parungao", password: "password123" });
  console.log("Login with username joshua.parungao: SUCCESS (role: " + login1.user.role + ")");

  const login2 = await authService.login({ identifier: "Joshua Parungao", password: "password123" });
  console.log("Login with full name 'Joshua Parungao': SUCCESS (role: " + login2.user.role + ")");

  const login3 = await authService.login({ identifier: "kyle.musngi", password: "password123" });
  console.log("Login with username kyle.musngi: SUCCESS (role: " + login3.user.role + ")");

  const login4 = await authService.login({ identifier: "Kyle Musngi", password: "password123" });
  console.log("Login with full name 'Kyle Musngi': SUCCESS (role: " + login4.user.role + ")");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
