-- Personal appearance and notification preferences, plus the eligibility
-- thresholds an administrator can now change without a redeploy.
--
-- Additive only: every column has a default, no existing row is rewritten and
-- nothing is dropped, so this applies to a live database without downtime and
-- an older build keeps working against it.

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "attendanceCritical" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "attendanceWarning" INTEGER NOT NULL DEFAULT 85,
ADD COLUMN     "markConcernPercent" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    -- Nullable: null means "follow the operating system", which is not the
    -- same as "definitely do not reduce motion".
    "reduceMotion" BOOLEAN,
    "defaultDepartmentId" TEXT,
    "defaultSemester" INTEGER,
    "defaultAcademicYear" INTEGER,
    "notifyDailyDigest" BOOLEAN NOT NULL DEFAULT true,
    "notifyWeeklyDigest" BOOLEAN NOT NULL DEFAULT false,
    "notifyHighSeverity" BOOLEAN NOT NULL DEFAULT false,
    "highSeverityNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "UserPreference_defaultDepartmentId_idx" ON "UserPreference"("defaultDepartmentId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_defaultDepartmentId_fkey" FOREIGN KEY ("defaultDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
