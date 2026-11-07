require("../src/config/env");
const prisma = require("../src/config/prisma");

// Computer hardware taxonomy removed so the user can configure custom business categories and subcategories.
const TAXONOMY_DATA = [];

function extractSpecsForSchema() {
  return {};
}

async function autoAlignExistingItems() {
  return;
}

async function main() {
  console.log("Standard product taxonomy seed skipped (custom user categories mode).");
}

module.exports = {
  ensureStandardProductTaxonomy: main,
  autoAlignExistingItems,
  extractSpecsForSchema,
  TAXONOMY_DATA,
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
