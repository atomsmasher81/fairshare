-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Expense" ADD COLUMN "editedAt" DATETIME;

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Settlement" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Settlement" ADD COLUMN "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Activity_groupId_createdAt_idx" ON "Activity"("groupId", "createdAt");
