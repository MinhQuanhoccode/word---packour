import { prisma } from "../db";

async function checkDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log("Database connection successful.");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void checkDatabaseConnection();
