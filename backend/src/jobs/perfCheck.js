import prisma from '../prismaClient.js';
import { topPerformers, passFailCounts, alertCountsByType, mentorDistribution, atRiskStudents, quietStudents } from '../lib/analyticsQueries.js';

// Seeds a realistically large department and times the queries that used to
// load everything into Node. Run against a throwaway database:
//
//   DATABASE_URL=postgresql://.../amis_perf npm run perf:analytics
//
// The point is not a benchmark score; it is catching the day somebody
// reintroduces a findMany that pulls every score row back.

const STUDENTS = Number(process.env.PERF_STUDENTS || 3000);
const SUBJECTS = 6;

const time = async (label, run) => {
  const started = process.hrtime.bigint();
  const result = await run();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const rows = Array.isArray(result) ? result.length : 1;
  console.log(`  ${label.padEnd(28)} ${ms.toFixed(0).padStart(6)} ms   ${rows} row(s)`);
  return ms;
};

const seed = async () => {
  console.log(`Seeding ${STUDENTS} students...`);

  const department = await prisma.department.upsert({
    where: { code: 'PERF' },
    update: {},
    create: { code: 'PERF', name: 'Performance Test Department' },
  });

  const batch = await prisma.batch.upsert({
    where: { departmentId_admissionYear: { departmentId: department.id, admissionYear: 2024 } },
    update: {},
    create: { departmentId: department.id, admissionYear: 2024, currentSemester: 3 },
  });

  const mentors = [];
  for (let index = 0; index < 100; index++) {
    mentors.push(await prisma.user.upsert({
      where: { email: `perf-mentor-${index}@example.edu` },
      update: {},
      create: {
        name: `Perf Mentor ${index}`,
        email: `perf-mentor-${index}@example.edu`,
        password: 'not-a-real-password-hash',
        role: 'MENTOR',
        approved: true,
        departmentId: department.id,
        maxStudents: 60,
      },
    }));
  }

  const subjects = [];
  for (let index = 0; index < SUBJECTS; index++) {
    subjects.push(await prisma.subject.upsert({
      where: { code: `PERF-${index}` },
      update: {},
      create: {
        name: `Perf Subject ${index}`,
        code: `PERF-${index}`,
        department: 'PERF',
        departmentId: department.id,
        academicYear: 2026,
        semester: 3,
        credits: 4,
      },
    }));
  }

  // Bulk inserts: this is fixture data, not a test of the write path.
  const existing = await prisma.student.count({ where: { departmentId: department.id } });

  for (let start = existing; start < STUDENTS; start += 500) {
    const chunk = Array.from({ length: Math.min(500, STUDENTS - start) }, (_, offset) => {
      const index = start + offset;
      return {
        name: `Perf Student ${index}`,
        rollNumber: `PERF${String(index).padStart(5, '0')}`,
        department: 'PERF',
        departmentId: department.id,
        batchId: batch.id,
        currentYear: 2,
        currentSemester: 3,
        currentAcademicYear: 2026,
        enrollmentYear: 2024,
        mentorId: mentors[index % mentors.length].id,
      };
    });

    await prisma.student.createMany({ data: chunk, skipDuplicates: true });
  }

  const students = await prisma.student.findMany({
    where: { departmentId: department.id },
    select: { id: true },
  });

  const records = await prisma.semesterRecord.findMany({
    where: { student: { departmentId: department.id } },
    select: { id: true, studentId: true },
  });

  const withRecord = new Set(records.map(record => record.studentId));
  const missing = students.filter(student => !withRecord.has(student.id));

  for (let start = 0; start < missing.length; start += 500) {
    await prisma.semesterRecord.createMany({
      data: missing.slice(start, start + 500).map(student => ({
        studentId: student.id,
        semester: 3,
        academicYear: 2026,
      })),
      skipDuplicates: true,
    });
  }

  const allRecords = await prisma.semesterRecord.findMany({
    where: { student: { departmentId: department.id } },
    select: { id: true },
  });

  if ((await prisma.score.count({ where: { subjectId: subjects[0].id } })) < allRecords.length) {
    for (let start = 0; start < allRecords.length; start += 200) {
      const chunk = allRecords.slice(start, start + 200);
      const scores = [];
      const alerts = [];

      for (const record of chunk) {
        for (const subject of subjects) {
          const internal = 20 + ((start + subject.semester) % 25);
          const exam = 15 + ((start + subject.credits) % 35);
          scores.push({
            semesterRecordId: record.id,
            subjectId: subject.id,
            test1: 20, test2: 20, assignment: 20,
            internalTotal: internal,
            exam,
            finalScore: internal + exam,
          });
        }

        if (start % 5 === 0) {
          alerts.push({
            semesterRecordId: record.id,
            type: 'AT_RISK',
            severity: 'HIGH',
            message: 'Seeded alert for the performance check.',
          });
        }
      }

      await prisma.score.createMany({ data: scores, skipDuplicates: true });
      if (alerts.length) await prisma.alert.createMany({ data: alerts, skipDuplicates: true });
    }
  }

  console.log(
    `Seeded: ${await prisma.student.count({ where: { departmentId: department.id } })} students, ` +
    `${await prisma.score.count()} scores, ${await prisma.alert.count()} alerts.\n`
  );
};

const run = async () => {
  await seed();

  // A super admin sees everything, which is the slowest case.
  const user = { id: 'perf', role: 'SUPER_ADMIN', __scope: { id: 'perf', role: 'SUPER_ADMIN', departmentIds: [], sectionIds: [] } };

  console.log('Analytics queries:');
  const timings = {
    topPerformers: await time('top performers', () => topPerformers(user, { limit: 10 })),
    passFail: await time('pass/fail counts', () => passFailCounts(user)),
    alertsByType: await time('alerts by type', () => alertCountsByType(user)),
    mentorDistribution: await time('mentor distribution', () => mentorDistribution(user)),
    atRisk: await time('at-risk students', () => atRiskStudents(user, { limit: 100 })),
    quiet: await time('quiet students', () => quietStudents(user, { days: 30, limit: 100 })),
  };

  const slowest = Math.max(...Object.values(timings));
  console.log(`\nSlowest: ${slowest.toFixed(0)} ms`);

  if (slowest > 2000) {
    console.error('That is slower than 2s, which a dashboard cannot absorb. Check the query plan.');
    process.exitCode = 1;
  }
};

if (process.argv[1] && process.argv[1].endsWith('perfCheck.js')) {
  run()
    .catch(error => {
      console.error('Performance check failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { seed as seedPerfData, run as runPerfCheck };
