require("dotenv").config();

const prisma = require("../src/config/prisma");

// Legacy computer initial stock removed so the user can input their own items and stock.
const initialStocks = [];

const main = async () => {
  console.log("\nInitial Inventory Seeder (no default computer stock seeded)");
  console.log("-----------------------------------------------------------");
  console.log("Initial stocks count:", initialStocks.length);
};

main()
  .catch((error) => {
    console.error("\nInitial inventory seeder failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
