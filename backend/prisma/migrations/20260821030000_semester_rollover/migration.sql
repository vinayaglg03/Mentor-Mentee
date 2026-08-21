-- CreateTable
CREATE TABLE "SemesterRollover" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromSemester" INTEGER NOT NULL,
    "toSemester" INTEGER NOT NULL,
    "promoted" INTEGER NOT NULL DEFAULT 0,
    "graduated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemesterRollover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SemesterRollover_batchId_idx" ON "SemesterRollover"("batchId");

-- AddForeignKey
ALTER TABLE "SemesterRollover" ADD CONSTRAINT "SemesterRollover_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemesterRollover" ADD CONSTRAINT "SemesterRollover_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

