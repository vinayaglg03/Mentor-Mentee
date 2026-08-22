-- Richer mentoring records: what the meeting was about, how it happened,
-- what was agreed, and when to come back to it.
--
-- createdAt/updatedAt are added so the 24-hour edit window has something
-- to measure against; existing rows take the migration time.

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('ACADEMIC', 'ATTENDANCE', 'PERSONAL', 'CAREER', 'DISCIPLINARY', 'ROUTINE_MEETING');

-- CreateEnum
CREATE TYPE "LogMode" AS ENUM ('IN_PERSON', 'PHONE', 'EMAIL', 'ONLINE');

-- AlterTable
ALTER TABLE "ProgressLog" ADD COLUMN     "actionItems" TEXT,
ADD COLUMN     "correctsId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "mode" "LogMode" NOT NULL DEFAULT 'IN_PERSON',
ADD COLUMN     "studentAcknowledged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "LogType" NOT NULL DEFAULT 'ROUTINE_MEETING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ProgressLog_mentorId_followUpDate_idx" ON "ProgressLog"("mentorId", "followUpDate");

-- CreateIndex
CREATE INDEX "ProgressLog_semesterRecordId_idx" ON "ProgressLog"("semesterRecordId");

-- AddForeignKey
ALTER TABLE "ProgressLog" ADD CONSTRAINT "ProgressLog_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "ProgressLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

