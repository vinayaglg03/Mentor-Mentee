-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'OFF');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "unsubscribeToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_unsubscribeToken_key" ON "User"("unsubscribeToken");


-- Existing users get a token so the unsubscribe link in their first digest
-- works without them having to sign in first.
UPDATE "User" SET "unsubscribeToken" = gen_random_uuid()::text WHERE "unsubscribeToken" IS NULL;
