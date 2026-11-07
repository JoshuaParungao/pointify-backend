require("../src/config/env");

const prisma = require("../src/config/prisma");

async function getRequiredBranchByCode(code) {
  const branch = await prisma.branch.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch) {
    throw new Error(`Required branch not found: ${code}`);
  }

  if (branch.status !== "ACTIVE") {
    throw new Error(`Required branch is not active: ${code}`);
  }

  return branch;
}

async function getRequiredUserByUsername(username) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error(`Required user not found: ${username}`);
  }

  if (user.status !== "ACTIVE") {
    throw new Error(`Required user is not active: ${username}`);
  }

  return user;
}

async function upsertUnit(unit, userId) {
  return prisma.unit.upsert({
    where: {
      unitCode: unit.unitCode,
    },
    update: {
      name: unit.name,
      description: unit.description,
      status: "ACTIVE",
      updatedById: userId,
    },
    create: {
      unitCode: unit.unitCode,
      name: unit.name,
      description: unit.description,
      status: "ACTIVE",
      createdById: userId,
      updatedById: userId,
    },
    select: {
      id: true,
      unitCode: true,
      name: true,
      status: true,
    },
  });
}

async function main() {
  const superOwner = await getRequiredUserByUsername("superowner");

  const units = [
    {
      unitCode: "PCS",
      name: "Pieces",
      description: "Default unit for individual products.",
    },
    {
      unitCode: "PIECE",
      name: "Piece",
      description: "Individual product or item count.",
    },
    {
      unitCode: "BOX",
      name: "Box",
      description: "Unit for boxed items or packaged boxes.",
    },
    {
      unitCode: "KIT",
      name: "Kit",
      description: "Unit for kits, combo packages, or modular toolkits.",
    },
    {
      unitCode: "METER",
      name: "Meter",
      description: "Unit for items measured by length.",
    },
    {
      unitCode: "PAIR",
      name: "Pair",
      description: "Unit for paired items.",
    },
    {
      unitCode: "ROLL",
      name: "Roll",
      description: "Unit for rolled items.",
    },
    {
      unitCode: "SET",
      name: "Set",
      description: "Unit for bundled items or complete sets.",
    },
    {
      unitCode: "UNIT",
      name: "Unit",
      description: "Standard discrete unit / equipment.",
    },
  ];

  console.log("");
  console.log("Seeding item catalog units (categories/items left empty for user entry)...");
  console.log("--------------------------------------------------------------------------");

  for (const unit of units) {
    const savedUnit = await upsertUnit(unit, superOwner.id);
    console.log(`UNIT | ${savedUnit.unitCode} | ${savedUnit.name} | ${savedUnit.status}`);
  }

  const unitCount = await prisma.unit.count();
  const categoryCount = await prisma.itemCategory.count();
  const itemCount = await prisma.item.count();

  console.log("");
  console.log("Item catalog seed completed.");
  console.log(`Units: ${unitCount}`);
  console.log(`Item categories: ${categoryCount}`);
  console.log(`Items: ${itemCount}`);
}

main()
  .catch((error) => {
    console.error("Item catalog seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
