-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "invested" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "deletedById" TEXT,
    "editedAt" DATETIME,
    "inputText" TEXT,
    "inputVia" TEXT,
    "parsedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "payee" TEXT,
    "externalRef" TEXT,
    "reviewMsgId" TEXT,
    "needLevel" TEXT,
    "assetId" TEXT,
    "paymentMethodId" TEXT,
    "notes" TEXT,
    "splitType" TEXT NOT NULL DEFAULT 'equal',
    CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "deletedById", "description", "editedAt", "externalRef", "groupId", "id", "inputText", "inputVia", "needLevel", "needsReview", "notes", "paidById", "parsedBy", "payee", "paymentMethodId", "reviewMsgId", "source", "splitType", "updatedAt") SELECT "amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "deletedById", "description", "editedAt", "externalRef", "groupId", "id", "inputText", "inputVia", "needLevel", "needsReview", "notes", "paidById", "parsedBy", "payee", "paymentMethodId", "reviewMsgId", "source", "splitType", "updatedAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_externalRef_idx" ON "Expense"("externalRef");
CREATE INDEX "Expense_groupId_date_idx" ON "Expense"("groupId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "AssetSnapshot_assetId_createdAt_idx" ON "AssetSnapshot"("assetId", "createdAt");
