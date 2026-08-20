import prisma from '../prismaClient.js';
import { assertCanAccessStudent } from '../lib/access.js';

export const getAllStudents = async (req, res, next) => {
  try {
    // Mentors only ever see their own mentees; HODs see everyone.
    const where = req.user.role === 'ADMIN' ? {} : { mentorId: req.user.id };

    const students = await prisma.student.findMany({
      where,
      include: { 
        mentor: { select: { name: true } }, 
        semesterRecords: {
          orderBy: { semester: 'desc' },
          include: { 
            alerts: { where: { resolved: false } },
            progressLogs: {
              orderBy: { date: 'desc' },
              include: { mentor: { select: { name: true } } }
            }
          }
        }
      }
    });
    res.json(students);
  } catch (error) {
    next(error);
  }
};

export const getStudentById = async (req, res, next) => {
  try {
    await assertCanAccessStudent(req.user, req.params.id);

    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { 
        mentor: { select: { id: true, name: true, email: true } },
        semesterRecords: {
          orderBy: { semester: 'desc' },
          include: {
            scores: { include: { subject: true } },
            alerts: { orderBy: { timestamp: 'desc' } },
            achievements: { orderBy: { createdAt: 'desc' } },
            progressLogs: { orderBy: { date: 'desc' }, include: { mentor: { select: { name: true } } } }
          }
        }
      }
    });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // --- On Demand Inactivity Check (on current semester) ---
    const currentRecord = student.semesterRecords[0];
    if (currentRecord) {
      const now = new Date();
      const lastLogDate = currentRecord.progressLogs.length > 0 ? new Date(currentRecord.progressLogs[0].date) : new Date(currentRecord.createdAt);
      const diffDays = (now - lastLogDate) / (1000 * 60 * 60 * 24);
      
      if (diffDays > 14) {
        const hasInactiveAlert = currentRecord.alerts.some(a => a.type === 'INACTIVE' && !a.resolved);
        if (!hasInactiveAlert) {
          const newAlert = await prisma.alert.create({
            data: {
              semesterRecordId: currentRecord.id,
              type: 'INACTIVE',
              severity: 'HIGH',
              message: `No progress logs recorded in the last 14 days for this semester.`
            }
          });
          currentRecord.alerts.unshift(newAlert);
        }
      }
    }

    res.json(student);
  } catch (error) {
    next(error);
  }
};

export const createStudent = async (req, res) => {
  console.log('--- CREATE STUDENT REQUEST BODY ---');
  console.log(req.body);
  try {
    const { name, rollNumber, department, currentYear, currentSemester, currentAcademicYear, enrollmentYear, email, mentorId } = req.body;
    
    const existing = await prisma.student.findFirst({
      where: { OR: [{ rollNumber }, { email: email || undefined }] }
    });
    if (existing) {
      return res.status(400).json({ error: 'Student with this USN or Email already exists' });
    }

    try {
      const student = await prisma.$transaction(async (tx) => {
        // Safe numeric parsing to avoid NaN
        const cYear = parseInt(currentYear) || 1;
        const cSem = parseInt(currentSemester) || 1;
        const cAcadYear = parseInt(currentAcademicYear) || new Date().getFullYear();
        const eYear = parseInt(enrollmentYear) || new Date().getFullYear();

        const stdData = { 
          name, 
          rollNumber, 
          department, 
          currentYear: cYear, 
          currentSemester: cSem,
          currentAcademicYear: cAcadYear,
          enrollmentYear: eYear, 
          email: email || null,
          mentorId: mentorId || (req.user.role === 'MENTOR' ? req.user.id : null)
        };

        console.log('--- PRISMA CREATE STUDENT DEBUG ---');
        console.log('Data:', JSON.stringify(stdData, null, 2));

        const std = await tx.student.create({
          data: stdData
        });

        // Create initial semester record
        await tx.semesterRecord.create({
          data: {
            studentId: std.id,
            semester: cSem,
            academicYear: cAcadYear
          }
        });

        return std;
      });

      res.status(201).json(student);
    } catch (innerError) {
      console.error('--- PRISMA TRANSACTION ERROR ---');
      console.error(innerError);
      throw innerError; // Rethrow to be caught by outer catch
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, rollNumber, department, currentYear, currentSemester, currentAcademicYear, enrollmentYear, email, mentorId } = req.body;

    await assertCanAccessStudent(req.user, id);

    const student = await prisma.student.update({
      where: { id },
      data: { 
        name, 
        rollNumber, 
        department, 
        currentYear: currentYear ? Number(currentYear) : undefined, 
        currentSemester: currentSemester ? Number(currentSemester) : undefined,
        currentAcademicYear: currentAcademicYear ? Number(currentAcademicYear) : undefined,
        enrollmentYear: enrollmentYear ? Number(enrollmentYear) : undefined,
        email,
        // Only a HOD may move a student to a different mentor.
        mentorId: req.user.role === 'ADMIN' ? mentorId : undefined
      }
    });
    res.json(student);
  } catch (error) {
    next(error);
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.student.delete({ where: { id } });
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const assignMentor = async (req, res) => {
  try {
    const { studentId, mentorId } = req.body;
    const student = await prisma.student.update({
      where: { id: studentId },
      data: { mentorId }
    });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
