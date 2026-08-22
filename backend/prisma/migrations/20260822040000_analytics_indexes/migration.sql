-- CreateIndex
CREATE INDEX "Student_status_departmentId_currentSemester_idx" ON "Student"("status", "departmentId", "currentSemester");

-- CreateIndex
CREATE INDEX "Student_status_mentorId_idx" ON "Student"("status", "mentorId");

-- CreateIndex
CREATE INDEX "SemesterRecord_semester_academicYear_idx" ON "SemesterRecord"("semester", "academicYear");

-- CreateIndex
CREATE INDEX "Score_finalScore_idx" ON "Score"("finalScore");

-- CreateIndex
CREATE INDEX "Alert_resolved_severity_idx" ON "Alert"("resolved", "severity");

