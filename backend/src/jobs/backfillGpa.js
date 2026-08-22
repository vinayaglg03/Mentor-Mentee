import prisma from '../prismaClient.js';
import { updateGpaForStudents } from '../lib/gpa.js';

// Recomputes SGPA and CGPA for every student. Safe to re-run: it only writes
// derived figures.
export const backfillGpa = async () => {
  const students = await prisma.student.findMany({ select: { id: true } });

  let semesterRecords = 0;

  // Batched so one long transaction does not hold the database open.
  for (let index = 0; index < students.length; index += 25) {
    const batch = students.slice(index, index + 25).map(student => student.id);
    const updated = await prisma.$transaction(
      (tx) => updateGpaForStudents(tx, batch),
      { timeout: 60000, maxWait: 10000 }
    );
    semesterRecords += updated.length;
  }

  return { students: students.length, semesterRecords };
};

// `npm run job:backfill-gpa`
if (process.argv[1] && process.argv[1].endsWith('backfillGpa.js')) {
  backfillGpa()
    .then(result => {
      console.log(`GPA backfill complete: ${result.students} students, ${result.semesterRecords} semester records updated.`);
    })
    .catch(error => {
      console.error('GPA backfill failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
