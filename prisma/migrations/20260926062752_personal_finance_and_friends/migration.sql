-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'upi',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "model" TEXT NOT NULL,
    "ms" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "needLevel" TEXT,
    "paymentMethodId" TEXT,
    "notes" TEXT,
    "splitType" TEXT NOT NULL DEFAULT 'equal',
    CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "description", "externalRef", "groupId", "id", "needsReview", "paidById", "payee", "reviewMsgId", "source", "updatedAt") SELECT "amount", "category", "createdAt", "createdById", "currency", "date", "deletedAt", "description", "externalRef", "groupId", "id", "needsReview", "paidById", "payee", "reviewMsgId", "source", "updatedAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_externalRef_idx" ON "Expense"("externalRef");
CREATE INDEX "Expense_groupId_date_idx" ON "Expense"("groupId", "date");
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "isDirect" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Group" ("createdAt", "createdById", "deletedAt", "description", "id", "inviteCode", "isPersonal", "name") SELECT "createdAt", "createdById", "deletedAt", "description", "id", "inviteCode", "isPersonal", "name" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upiId" TEXT,
    "apiTokenHash" TEXT,
    "defaultGroupId" TEXT,
    "linkCode" TEXT,
    "linkCodeExpires" DATETIME,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "claimCode" TEXT,
    "addedById" TEXT
);
INSERT INTO "new_User" ("apiTokenHash", "createdAt", "defaultGroupId", "displayName", "id", "isAdmin", "linkCode", "linkCodeExpires", "passwordHash", "upiId", "username") SELECT "apiTokenHash", "createdAt", "defaultGroupId", "displayName", "id", "isAdmin", "linkCode", "linkCodeExpires", "passwordHash", "upiId", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_apiTokenHash_key" ON "User"("apiTokenHash");
CREATE UNIQUE INDEX "User_linkCode_key" ON "User"("linkCode");
CREATE UNIQUE INDEX "User_claimCode_key" ON "User"("claimCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "AiCall_userId_createdAt_idx" ON "AiCall"("userId", "createdAt");
