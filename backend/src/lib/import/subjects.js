export const columns = [
  { key: 'code', header: 'Code', required: true, example: 'CS301' },
  { key: 'name', header: 'Name', required: true, example: 'Data Structures' },
  { key: 'department', header: 'Department', required: true, example: 'CSE' },
  { key: 'semester', header: 'Semester', required: true, example: 3 },
  { key: 'credits', header: 'Credits', required: true, example: 4 },
  { key: 'academicYear', header: 'Academic Year', required: false, example: 2026 },
];

export const instructions = [
  'One subject per row. Code must be unique across the college.',
  'Semester is 1-12 and Credits is 1-10; both are whole numbers.',
  'Credits feed the SGPA and CGPA calculation, so they must be correct.',
  'Academic Year defaults to the current year when left blank.',
  'A subject whose Code already exists is updated, not duplicated.',
];

const asInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

export const validate = async ({ rows, prisma }) => {
  const codes = rows.map(r => String(r.values.code ?? '').trim()).filter(Boolean);
  const existingSubjects = await prisma.subject.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(existingSubjects.map(s => [s.code, s]));

  const seenCodes = new Map();
  const errors = [];
  const prepared = [];

  for (const { rowNumber, values } of rows) {
    const rowErrors = [];
    const add = (column, message) => rowErrors.push({ rowNumber, column, message });

    const code = String(values.code ?? '').trim();
    const name = String(values.name ?? '').trim();
    const department = String(values.department ?? '').trim();
    const semester = asInt(values.semester);
    const credits = asInt(values.credits);
    const academicYear = asInt(values.academicYear) ?? new Date().getFullYear();

    if (!code) add('Code', 'Code is required.');
    if (!name) add('Name', 'Name is required.');
    if (!department) add('Department', 'Department is required.');

    if (semester === null || semester < 1 || semester > 12) {
      add('Semester', 'Semester must be a whole number between 1 and 12.');
    }
    if (credits === null || credits < 1 || credits > 10) {
      add('Credits', 'Credits must be a whole number between 1 and 10.');
    }
    if (academicYear < 1900 || academicYear > 2200) {
      add('Academic Year', 'Academic Year must be a four-digit year.');
    }

    if (code) {
      const duplicateRow = seenCodes.get(code);
      if (duplicateRow) {
        add('Code', `Duplicate Code, already used on row ${duplicateRow}.`);
      } else {
        seenCodes.set(code, rowNumber);
      }
    }

    errors.push(...rowErrors);

    prepared.push({
      rowNumber,
      action: rowErrors.length > 0 ? 'invalid' : byCode.has(code) ? 'update' : 'create',
      data: { code, name, department, semester, credits, academicYear },
      display: { code, name, department, semester, credits },
    });
  }

  return { rows: prepared, errors };
};

export const commit = async ({ rows, tx }) => {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const { data } = row;
    const existing = await tx.subject.findUnique({ where: { code: data.code } });

    if (existing) {
      await tx.subject.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await tx.subject.create({ data });
      created++;
    }
  }

  return { created, updated };
};
