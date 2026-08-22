-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "semesterRecordId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classesHeld" INTEGER NOT NULL,
    "classesAttended" INTEGER NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_semesterRecordId_idx" ON "Attendance"("semesterRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_semesterRecordId_subjectId_key" ON "Attendance"("semesterRecordId", "subjectId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_semesterRecordId_fkey" FOREIGN KEY ("semesterRecordId") REFERENCES "SemesterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

