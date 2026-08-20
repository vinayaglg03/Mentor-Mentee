-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "gradePoint" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_label_key" ON "GradeBand"("label");

-- CreateIndex
CREATE INDEX "GradeBand_minScore_idx" ON "GradeBand"("minScore");


-- A default 10-point scale so GPA works out of the box. An ADMIN can replace
-- these bands through PUT /api/admin/grade-scale.
INSERT INTO "GradeBand" ("id", "label", "minScore", "gradePoint", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'S', 90, 10, NOW(), NOW()),
  (gen_random_uuid(), 'A', 80, 9,  NOW(), NOW()),
  (gen_random_uuid(), 'B', 70, 8,  NOW(), NOW()),
  (gen_random_uuid(), 'C', 60, 7,  NOW(), NOW()),
  (gen_random_uuid(), 'D', 50, 6,  NOW(), NOW()),
  (gen_random_uuid(), 'E', 40, 5,  NOW(), NOW()),
  (gen_random_uuid(), 'F', 0,  0,  NOW(), NOW());
