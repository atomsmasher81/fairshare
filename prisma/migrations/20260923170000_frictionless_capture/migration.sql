-- AlterTable
ALTER TABLE "User" ADD COLUMN "apiTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "defaultGroupId" TEXT;
ALTER TABLE "User" ADD COLUMN "linkCode" TEXT;
ALTER TABLE "User" ADD COLUMN "linkCodeExpires" DATETIME;
ALTER TABLE "User" ADD COLUMN "upiId" TEXT;

-- CreateTable
CREATE TABLE "PayeeRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "payeeKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "groupId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayeeRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "category" TEXT NOT NULL DEFAULT 'other',
    "date" DATETIME NOT NULL,
    "paidById" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'web',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "payee" TEXT,
    "externalRef" TEXT,
    "reviewMsgId" TEXT,
    CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "description", "groupId", "id", "paidById", "updatedAt") SELECT "amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "description", "groupId", "id", "paidById", "updatedAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_externalRef_idx" ON "Expense"("externalRef");
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Group" ("createdAt", "createdById", "deletedAt", "description", "id", "inviteCode", "name") SELECT "createdAt", "createdById", "deletedAt", "description", "id", "inviteCode", "name" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PayeeRule_userId_payeeKey_key" ON "PayeeRule"("userId", "payeeKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiTokenHash_key" ON "User"("apiTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkCode_key" ON "User"("linkCode");

