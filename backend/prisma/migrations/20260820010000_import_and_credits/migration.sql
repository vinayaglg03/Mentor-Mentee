-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "PendingImport" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingImport_userId_idx" ON "PendingImport"("userId");

-- CreateIndex
CREATE INDEX "PendingImport_expiresAt_idx" ON "PendingImport"("expiresAt");

