-- AlterTable
ALTER TABLE "AiCall" ADD COLUMN "expenseId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "inputText" TEXT;
ALTER TABLE "Expense" ADD COLUMN "inputVia" TEXT;
ALTER TABLE "Expense" ADD COLUMN "parsedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiInstructions" TEXT;
ALTER TABLE "User" ADD COLUMN "defaultMethodId" TEXT;
