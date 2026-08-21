import prisma from '../prismaClient.js';

// The same alias map the department migration uses. Kept in step with
// prisma/migrations/20260821010000_departments_batches_sections/migration.sql.
export const DEPARTMENT_ALIASES = {
  CSE: 'CSE',
  CS: 'CSE',
  'COMPUTER SCIENCE': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  'COMPUTER SCIENCE & ENGINEERING': 'CSE',
  CSBS: 'CSBS',
  'COMPUTER SCIENCE AND BUSINESS SYSTEMS': 'CSBS',
  'COMPUTER SCIENCE & BUSINESS SYSTEMS': 'CSBS',
};

export const DEPARTMENT_NAMES = {
  CSE: 'Computer Science and Engineering',
  CSBS: 'Computer Science and Business Systems',
};

export const normaliseDepartment = (value) => String(value ?? '').trim().toUpperCase();

export const resolveDepartmentCode = (value) => {
  const normalised = normaliseDepartment(value);
  if (!normalised) return null;
  return DEPARTMENT_ALIASES[normalised] ?? normalised;
};

// A dry run of the department migration: what each free-text value would
// become, and anything that would stop the migration. Reads only.
export const departmentReport = async () => {
  const [students, subjects] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT "department" AS value, COUNT(*)::int AS count FROM "Student" GROUP BY "department"'),
    prisma.$queryRawUnsafe('SELECT "department" AS value, COUNT(*)::int AS count FROM "Subject" GROUP BY "department"'),
  ]);

  const byCode = new Map();
  const unmapped = [];

  const record = (row, kind) => {
    const code = resolveDepartmentCode(row.value);

    if (!code) {
      unmapped.push({ value: row.value, count: row.count, kind });
      return;
    }

    if (!byCode.has(code)) {
      byCode.set(code, { code, name: DEPARTMENT_NAMES[code] ?? code, variants: new Set(), students: 0, subjects: 0 });
    }

    const entry = byCode.get(code);
    entry.variants.add(JSON.stringify(row.value));
    entry[kind] += row.count;
  };

  for (const row of students) record(row, 'students');
  for (const row of subjects) record(row, 'subjects');

  return {
    departments: [...byCode.values()]
      .map(entry => ({ ...entry, variants: [...entry.variants].map(variant => JSON.parse(variant)) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    unmapped,
  };
};

// `npm run report:departments`
if (process.argv[1] && process.argv[1].endsWith('departmentReport.js')) {
  departmentReport()
    .then(({ departments, unmapped }) => {
      console.log('\nDepartment migration dry run\n');

      for (const entry of departments) {
        const variants = entry.variants.map(variant => JSON.stringify(variant)).join(', ');
        console.log(`  ${entry.code.padEnd(8)} ${entry.name}`);
        console.log(`  ${''.padEnd(8)} from ${variants}`);
        console.log(`  ${''.padEnd(8)} ${entry.students} student(s), ${entry.subjects} subject(s)\n`);
      }

      if (unmapped.length > 0) {
        console.error(`  ${unmapped.length} value(s) could not be mapped. The migration will refuse to run:`);
        for (const row of unmapped) {
          console.error(`    ${JSON.stringify(row.value)} (${row.count} ${row.kind})`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(`  ${departments.length} department(s), 0 unmapped.\n`);
    })
    .catch(error => {
      console.error('Department report failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
