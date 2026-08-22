-- Departments, batches and sections.
--
-- This migration carries data: the free-text Student.department and
-- Subject.department strings become real Department rows and foreign keys.
-- It is deliberately written by hand rather than generated, because the
-- generated version would add NOT NULL columns to populated tables.
--
-- Order: create tables -> add nullable columns -> normalise and backfill ->
-- fail loudly on anything unmapped -> only then enforce NOT NULL.
--
-- Run `npm run report:departments` first for a dry run of the mapping.

-- ---------------------------------------------------------------- tables ---

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "admissionYear" INTEGER NOT NULL,
    "currentSemester" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");
CREATE INDEX "Batch_departmentId_idx" ON "Batch"("departmentId");
CREATE UNIQUE INDEX "Batch_departmentId_admissionYear_key" ON "Batch"("departmentId", "admissionYear");
CREATE INDEX "Section_batchId_idx" ON "Section"("batchId");
CREATE INDEX "Section_coordinatorId_idx" ON "Section"("coordinatorId");
CREATE UNIQUE INDEX "Section_batchId_name_key" ON "Section"("batchId", "name");

-- Nullable for now; made NOT NULL at the end, once every row is mapped.
ALTER TABLE "Student" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Student" ADD COLUMN "batchId" TEXT;
ALTER TABLE "Student" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "Subject" ADD COLUMN "departmentId" TEXT;

-- ------------------------------------------------------------ alias map ---

-- Variant spellings that fold onto one canonical code. The rows below were
-- generated from the distinct values actually present ("CSE", "CSBS" and a
-- " CSBS" with a leading space), plus the long forms of those same two
-- departments, since they are what a person types into a free-text box.
-- Matching is always done on UPPER(TRIM(value)), so whitespace and case
-- variants need no entry here.
CREATE TEMP TABLE _department_alias (variant TEXT PRIMARY KEY, code TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO _department_alias (variant, code) VALUES
  ('CSE', 'CSE'),
  ('CS', 'CSE'),
  ('COMPUTER SCIENCE', 'CSE'),
  ('COMPUTER SCIENCE AND ENGINEERING', 'CSE'),
  ('COMPUTER SCIENCE & ENGINEERING', 'CSE'),
  ('CSBS', 'CSBS'),
  ('COMPUTER SCIENCE AND BUSINESS SYSTEMS', 'CSBS'),
  ('COMPUTER SCIENCE & BUSINESS SYSTEMS', 'CSBS');

-- Display names for the canonical codes. A code with no entry keeps the code
-- as its name, which is honest rather than invented.
CREATE TEMP TABLE _department_name (code TEXT PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO _department_name (code, name) VALUES
  ('CSE', 'Computer Science and Engineering'),
  ('CSBS', 'Computer Science and Business Systems');

-- ---------------------------------------------------------- departments ---

-- Every distinct department string in use, normalised and folded through the
-- alias map. An unknown value keeps its normalised form as its code, so it
-- still gets a Department row rather than blocking the migration; only a
-- blank value is unmappable.
CREATE TEMP TABLE _department_source AS
SELECT DISTINCT
  raw,
  COALESCE(alias.code, NULLIF(UPPER(TRIM(raw)), '')) AS code
FROM (
  SELECT "department" AS raw FROM "Student"
  UNION
  SELECT "department" AS raw FROM "Subject"
) AS values
LEFT JOIN _department_alias AS alias ON alias.variant = UPPER(TRIM(values.raw));

INSERT INTO "Department" ("id", "code", "name", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  source.code,
  COALESCE(names.name, source.code),
  NOW(),
  NOW()
FROM (SELECT DISTINCT code FROM _department_source WHERE code IS NOT NULL) AS source
LEFT JOIN _department_name AS names ON names.code = source.code
ON CONFLICT ("code") DO NOTHING;

UPDATE "Student" AS s
SET "departmentId" = d."id"
FROM _department_source AS src
JOIN "Department" AS d ON d."code" = src.code
WHERE s."department" = src.raw;

UPDATE "Subject" AS sub
SET "departmentId" = d."id"
FROM _department_source AS src
JOIN "Department" AS d ON d."code" = src.code
WHERE sub."department" = src.raw;

-- Fail loudly, naming the values that could not be mapped, rather than
-- guessing or silently dropping rows.
DO $$
DECLARE
  unmapped TEXT;
  affected INT;
BEGIN
  SELECT string_agg(DISTINCT format('%L', "department"), ', '), COUNT(*)
    INTO unmapped, affected
  FROM (
    SELECT "department" FROM "Student" WHERE "departmentId" IS NULL
    UNION ALL
    SELECT "department" FROM "Subject" WHERE "departmentId" IS NULL
  ) AS rows;

  IF affected > 0 THEN
    RAISE EXCEPTION
      'Department migration aborted: % row(s) have a department value that could not be mapped: %. Add an alias for each to _department_alias in this migration and re-run.',
      affected, unmapped;
  END IF;
END $$;

-- --------------------------------------------------------------- batches ---

-- One batch per department and admission year, taken from the students who
-- are already in it. currentSemester is the furthest semester any of its
-- students has reached, so a freshly promoted batch is not pulled backwards.
INSERT INTO "Batch" ("id", "departmentId", "admissionYear", "currentSemester", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  s."departmentId",
  s."enrollmentYear",
  GREATEST(MAX(s."currentSemester"), 1),
  NOW(),
  NOW()
FROM "Student" AS s
WHERE s."departmentId" IS NOT NULL
GROUP BY s."departmentId", s."enrollmentYear"
ON CONFLICT ("departmentId", "admissionYear") DO NOTHING;

UPDATE "Student" AS s
SET "batchId" = b."id"
FROM "Batch" AS b
WHERE b."departmentId" = s."departmentId"
  AND b."admissionYear" = s."enrollmentYear";

DO $$
DECLARE
  affected INT;
BEGIN
  SELECT COUNT(*) INTO affected FROM "Student" WHERE "batchId" IS NULL;

  IF affected > 0 THEN
    RAISE EXCEPTION
      'Department migration aborted: % student(s) could not be placed in a batch. Check enrollmentYear on those rows.',
      affected;
  END IF;
END $$;

-- Sections are left empty: nothing in the existing data says which section a
-- student belongs to, and inventing one would be worse than leaving it null.

-- ---------------------------------------------------------------- report ---

DO $$
DECLARE
  departments INT;
  students INT;
  subjects INT;
  batches INT;
  mapping TEXT;
BEGIN
  SELECT COUNT(*) INTO departments FROM "Department";
  SELECT COUNT(*) INTO students FROM "Student" WHERE "departmentId" IS NOT NULL;
  SELECT COUNT(*) INTO subjects FROM "Subject" WHERE "departmentId" IS NOT NULL;
  SELECT COUNT(*) INTO batches FROM "Batch";

  SELECT string_agg(line, E'\n  ') INTO mapping
  FROM (
    SELECT format('%L -> %s (%s students, %s subjects)',
             d."code", d."name",
             (SELECT COUNT(*) FROM "Student" s WHERE s."departmentId" = d."id"),
             (SELECT COUNT(*) FROM "Subject" sub WHERE sub."departmentId" = d."id")) AS line
    FROM "Department" d ORDER BY d."code"
  ) AS lines;

  RAISE NOTICE 'Department migration report: % department(s), % batch(es), % student(s) and % subject(s) mapped, 0 unmapped.%  %',
    departments, batches, students, subjects, E'\n  ', COALESCE(mapping, '(no data)');
END $$;

-- --------------------------------------------------------- constraints ----

ALTER TABLE "Student" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "batchId" SET NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "departmentId" SET NOT NULL;

CREATE INDEX "Student_departmentId_idx" ON "Student"("departmentId");
CREATE INDEX "Student_batchId_idx" ON "Student"("batchId");
CREATE INDEX "Student_sectionId_idx" ON "Student"("sectionId");
CREATE INDEX "Subject_departmentId_idx" ON "Subject"("departmentId");

ALTER TABLE "Department" ADD CONSTRAINT "Department_hodId_fkey" FOREIGN KEY ("hodId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Section" ADD CONSTRAINT "Section_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Section" ADD CONSTRAINT "Section_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
