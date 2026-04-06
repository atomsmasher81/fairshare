-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "deletedAt" DATETIME;
