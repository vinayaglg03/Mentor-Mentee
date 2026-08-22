import bcrypt from 'bcryptjs';
import prisma from '../prismaClient.js';
import { saveScore, saveAttendance } from '../lib/scoring.js';
import { updateGpaForStudents } from '../lib/gpa.js';
import { DEFAULT_BANDS } from '../lib/gpa.js';

// Enough data to judge whether AMIS is worth adopting, without anybody
// having to put real student records in first. Everything it writes is
// flagged isDemo and comes out again with `npm run seed:demo -- --remove`.

const DEPARTMENT = { code: 'DEMO', name: 'Demo Department (sample data)' };
const ADMISSION_YEAR = new Date().getFullYear() - 1;
const SEMESTER = 3;
const ACADEMIC_YEAR = new Date().getFullYear();

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Ananya', 'Arjun', 'Bhavana', 'Chirag', 'Deepika', 'Divya', 'Farhan', 'Gauri',
  'Harsha', 'Ishaan', 'Jyothi', 'Kiran', 'Lakshmi', 'Manoj', 'Meera', 'Nikhil', 'Pooja', 'Pranav',
  'Rahul', 'Ravi', 'Sanjana', 'Shreya', 'Sneha', 'Tejas', 'Uma', 'Varun', 'Vikram', 'Yashas',
];

const LAST_NAMES = ['Rao', 'Nair', 'Shetty', 'Hegde', 'Kulkarni', 'Reddy', 'Patil', 'Gowda', 'Iyer', 'Menon'];

const SUBJECTS = [
  { code: 'DEMO-CS301', name: 'Data Structures', credits: 4 },
  { code: 'DEMO-CS302', name: 'Operating Systems', credits: 4 },
  { code: 'DEMO-CS303', name: 'Database Systems', credits: 3 },
  { code: 'DEMO-CS304', name: 'Computer Networks', credits: 3 },
  { code: 'DEMO-CS305', name: 'Software Engineering', credits: 3 },
  { code: 'DEMO-CS306', name: 'Discrete Mathematics', credits: 4 },
];

const MENTORS = [
  { name: 'Dr. Meera Nair', email: 'demo.meera@example.edu' },
  { name: 'Prof. Anil Kumar', email: 'demo.anil@example.edu' },
  { name: 'Dr. Fatima Sheikh', email: 'demo.fatima@example.edu' },
];

const REMARKS = [
  'Discussed internal marks and agreed a revision plan for the next test.',
  'Attendance shortfall reviewed with the student; parents informed.',
  'Student asked about internship options; shared the placement cell contact.',
  'Routine monthly check-in. No concerns raised.',
  'Reviewed lab performance, which has improved since the last meeting.',
  'Discussed difficulty with the maths paper; peer study group suggested.',
];

// Deterministic so two runs produce the same demo, and reviewers see the
// same thing you did.
let seed = 20260822;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => Math.round(min + random() * (max - min));

export const removeDemoData = async () => {
  const students = await prisma.student.findMany({ where: { isDemo: true }, select: { id: true } });
  const studentIds = students.map(student => student.id);

  const removed = await prisma.$transaction(async (tx) => {
    // SemesterRecord cascades to scores, attendance, alerts, achievements
    // and logs, so the students go first.
    await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    const subjects = await tx.subject.deleteMany({ where: { isDemo: true } });
    const users = await tx.user.deleteMany({ where: { isDemo: true } });

    const demoDepartments = await tx.department.findMany({ where: { isDemo: true }, select: { id: true } });
    const departmentIds = demoDepartments.map(department => department.id);

    await tx.section.deleteMany({ where: { batch: { departmentId: { in: departmentIds } } } });
    await tx.batch.deleteMany({ where: { departmentId: { in: departmentIds } } });
    const departments = await tx.department.deleteMany({ where: { id: { in: departmentIds } } });

    return {
      students: studentIds.length,
      subjects: subjects.count,
      users: users.count,
      departments: departments.count,
    };
  }, { timeout: 120000, maxWait: 15000 });

  return removed;
};

// `students` is a parameter so tests can seed a handful quickly; the
// command-line default is a full class.
export const seedDemo = async ({ students: studentCount = 30 } = {}) => {
  // Re-running replaces the demo rather than stacking a second copy on top.
  await removeDemoData();

  if ((await prisma.gradeBand.count()) === 0) {
    await prisma.gradeBand.createMany({ data: DEFAULT_BANDS });
  }

  const department = await prisma.department.create({
    data: { code: DEPARTMENT.code, name: DEPARTMENT.name, isDemo: true },
  });

  const batch = await prisma.batch.create({
    data: { departmentId: department.id, admissionYear: ADMISSION_YEAR, currentSemester: SEMESTER },
  });

  const section = await prisma.section.create({ data: { batchId: batch.id, name: 'A' } });

  const password = await bcrypt.hash('DemoPassword123', 10);
  const mentors = [];
  for (const mentor of MENTORS) {
    mentors.push(await prisma.user.create({
      data: {
        name: mentor.name,
        email: mentor.email,
        password,
        role: 'MENTOR',
        approved: true,
        isDemo: true,
        departmentId: department.id,
        maxStudents: 30,
      },
    }));
  }

  const subjects = [];
  for (const subject of SUBJECTS) {
    subjects.push(await prisma.subject.create({
      data: {
        ...subject,
        department: department.code,
        departmentId: department.id,
        academicYear: ACADEMIC_YEAR,
        semester: SEMESTER,
        isDemo: true,
      },
    }));
  }

  const students = [];

  for (let index = 0; index < studentCount; index++) {
    const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${pick(LAST_NAMES)}`;
    const rollNumber = `DEMO${ADMISSION_YEAR}CS${String(index + 1).padStart(3, '0')}`;

    const student = await prisma.student.create({
      data: {
        name,
        rollNumber,
        email: `${rollNumber.toLowerCase()}@example.edu`,
        department: department.code,
        departmentId: department.id,
        batchId: batch.id,
        sectionId: section.id,
        currentYear: Math.ceil(SEMESTER / 2),
        currentSemester: SEMESTER,
        currentAcademicYear: ACADEMIC_YEAR,
        enrollmentYear: ADMISSION_YEAR,
        mentorId: mentors[index % mentors.length].id,
        isDemo: true,
      },
    });

    const record = await prisma.semesterRecord.create({
      data: { studentId: student.id, semester: SEMESTER, academicYear: ACADEMIC_YEAR },
    });

    // A realistic spread: most students fine, a few struggling, one or two
    // in real trouble, so the alerts and the at-risk list have something to
    // show.
    const band = index % 10 === 0 ? 'struggling' : index % 5 === 0 ? 'borderline' : 'steady';

    for (const subject of subjects) {
      const ceiling = band === 'struggling' ? 14 : band === 'borderline' ? 19 : 25;
      const test1 = between(band === 'struggling' ? 4 : 10, ceiling);
      const test2 = between(band === 'struggling' ? 4 : 10, ceiling);
      const assignment = between(band === 'struggling' ? 6 : 14, 25);
      const exam = between(band === 'struggling' ? 8 : band === 'borderline' ? 18 : 26, 50);

      await saveScore(prisma, {
        semesterRecordId: record.id,
        semester: SEMESTER,
        subjectId: subject.id,
        test1, test2, assignment, exam,
      });

      const held = 48;
      const attended = band === 'struggling'
        ? between(24, 33)
        : band === 'borderline'
          ? between(34, 40)
          : between(41, 48);

      await saveAttendance(prisma, {
        semesterRecordId: record.id,
        subjectId: subject.id,
        subjectCode: subject.code,
        classesHeld: held,
        classesAttended: attended,
      });
    }

    // A couple of mentoring interactions each, some with a follow-up due.
    const logCount = between(1, 3);
    for (let entry = 0; entry < logCount; entry++) {
      const daysAgo = between(3, 60);
      await prisma.progressLog.create({
        data: {
          semesterRecordId: record.id,
          mentorId: student.mentorId,
          remark: pick(REMARKS),
          type: pick(['ACADEMIC', 'ATTENDANCE', 'ROUTINE_MEETING', 'CAREER']),
          mode: pick(['IN_PERSON', 'PHONE', 'ONLINE']),
          date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          ...(band !== 'steady' && entry === 0
            ? {
              actionItems: 'Attend every lab this month and bring the record book to the next meeting.',
              followUpDate: new Date(Date.now() + between(-5, 12) * 24 * 60 * 60 * 1000),
            }
            : {}),
        },
      });
    }

    if (band === 'steady' && index % 7 === 0) {
      await prisma.achievement.create({
        data: {
          semesterRecordId: record.id,
          title: pick(['Runner-up, state hackathon', 'Best paper, department symposium', 'Inter-college quiz finalist']),
        },
      });
    }

    students.push(student);
  }

  await updateGpaForStudents(prisma, students.map(student => student.id));

  const alerts = await prisma.alert.count({ where: { semesterRecord: { student: { isDemo: true } } } });

  return {
    department: department.code,
    mentors: mentors.length,
    students: students.length,
    subjects: subjects.length,
    alerts,
    mentorLogins: MENTORS.map(mentor => mentor.email),
  };
};

// `npm run seed:demo` / `npm run seed:demo -- --remove`
if (process.argv[1] && process.argv[1].endsWith('seedDemo.js')) {
  const remove = process.argv.includes('--remove');

  (remove ? removeDemoData() : seedDemo())
    .then(result => {
      if (remove) {
        console.log(
          `Demo data removed: ${result.students} students, ${result.subjects} subjects, ` +
          `${result.users} accounts, ${result.departments} department.`
        );
        return;
      }

      console.log(
        `\nDemo data created in the ${result.department} department:\n` +
        `  ${result.students} students, ${result.mentors} mentors, ${result.subjects} subjects, ${result.alerts} alerts\n\n` +
        `Sign in as any of these (password: DemoPassword123):\n` +
        result.mentorLogins.map(email => `  ${email}`).join('\n') +
        `\n\nRemove it all again with: npm run seed:demo -- --remove\n`
      );
    })
    .catch(error => {
      console.error('Demo seed failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
