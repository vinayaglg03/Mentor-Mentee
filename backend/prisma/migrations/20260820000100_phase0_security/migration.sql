-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'DROPPED', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';


-- Accounts that already existed before approvals were introduced stay usable;
-- only newly self-registered users start out unapproved.
UPDATE "User" SET "approved" = true;
