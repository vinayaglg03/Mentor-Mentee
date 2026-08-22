-- Four-level role hierarchy: SUPER_ADMIN > HOD > COORDINATOR > MENTOR.
--
-- Existing ADMIN accounts become HOD and existing MENTOR accounts stay as
-- they are. The longest-standing ADMIN is promoted to SUPER_ADMIN so the
-- institution always has one account that can see everything - without it,
-- nobody could assign the remaining HODs to their departments.
--
-- Postgres will not let a value added to an enum be used in the same
-- transaction, and Prisma runs each migration in one, so the enum is
-- replaced rather than extended.

CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE "role"::text WHEN 'ADMIN' THEN 'HOD' ELSE 'MENTOR' END)::"Role_new";

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MENTOR';

-- A HOD or coordinator is scoped to one department.
ALTER TABLE "User" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one SUPER_ADMIN: the oldest former ADMIN.
UPDATE "User"
SET "role" = 'SUPER_ADMIN'
WHERE "id" = (
  SELECT "id" FROM "User" WHERE "role" = 'HOD' ORDER BY "createdAt" ASC LIMIT 1
);

-- With a single department there is no ambiguity, so every HOD and
-- coordinator is attached to it. With more than one, guessing would put a
-- person in charge of the wrong students, so they are left unassigned and
-- named in the report below.
DO $$
DECLARE
  department_count INT;
  only_department TEXT;
  unassigned TEXT;
  unassigned_count INT;
  super_admin TEXT;
BEGIN
  SELECT COUNT(*) INTO department_count FROM "Department";

  IF department_count = 1 THEN
    SELECT "id" INTO only_department FROM "Department";
    UPDATE "User" SET "departmentId" = only_department WHERE "role" IN ('HOD', 'COORDINATOR');
    UPDATE "Department" SET "hodId" = (SELECT "id" FROM "User" WHERE "role" = 'HOD' ORDER BY "createdAt" ASC LIMIT 1)
      WHERE "id" = only_department AND "hodId" IS NULL;
  END IF;

  SELECT string_agg(format('%s <%s>', "name", "email"), ', '), COUNT(*)
    INTO unassigned, unassigned_count
  FROM "User" WHERE "role" IN ('HOD', 'COORDINATOR') AND "departmentId" IS NULL;

  SELECT format('%s <%s>', "name", "email") INTO super_admin
  FROM "User" WHERE "role" = 'SUPER_ADMIN' LIMIT 1;

  RAISE NOTICE 'Role migration: SUPER_ADMIN is %. % department(s) found.',
    COALESCE(super_admin, '(none - no ADMIN existed)'), department_count;

  IF unassigned_count > 0 THEN
    RAISE WARNING 'Role migration: % account(s) need a department before they can see anything: %. Assign them with PUT /api/admin/users/:id/department as the SUPER_ADMIN.',
      unassigned_count, unassigned;
  END IF;
END $$;
