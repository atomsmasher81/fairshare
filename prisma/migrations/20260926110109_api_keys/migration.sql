-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- Carry over existing single keys so current shortcuts and MCP clients keep working
INSERT INTO "ApiKey" ("id", "userId", "name", "hash", "prefix", "createdAt")
SELECT 'ak_' || lower(hex(randomblob(12))), "id", 'Personal key', "apiTokenHash", 'fs_…', CURRENT_TIMESTAMP
FROM "User" WHERE "apiTokenHash" IS NOT NULL;
