import prisma from '../prismaClient.js';
import { assertCanAccessStudent } from '../lib/access.js';
import { attendancePercent } from '../lib/scoring.js';

export const getAllStudents = async (req, res, next) => {
  try {
    // Mentors only ever see their own mentees; HODs see everyone.
    // Students who left the programme are excluded from listings.
    const where = req.user.role === 'ADMIN'
      ? { status: 'ACTIVE' }
      : { status: 'ACTIVE', mentorId: req.user.id };

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
            attendance: { include: { subject: { select: { id: true, code: true, name: true } } } },
            alerts: { orderBy: { timestamp: 'desc' } },
            achievements: { orderBy: { createdAt: 'desc' } },
            progressLogs: { orderBy: { date: 'desc' }, include: { mentor: { select: { name: true } } } }
          }
        }
      }
    });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    res.json({
      ...student,
      semesterRecords: student.semesterRecords.map(record => {
        const rows = record.attendance || [];
        const classesHeld = rows.reduce((sum, row) => sum + row.classesHeld, 0);
        const classesAttended = rows.reduce((sum, row) => sum + row.classesAttended, 0);

        return {
          ...record,
          attendancePercent: attendancePercent({ classesHeld, classesAttended }),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const createStudent = async (req, res, next) => {
  try {
    const { name, rollNumber, department, currentYear, currentSemester, currentAcademicYear, enrollmentYear, email, mentorId } = req.body;
    
    const existing = await prisma.student.findFirst({
      where: { OR: [{ rollNumber }, { email: email || undefined }] }
    });
    if (existing) {
      return res.status(400).json({ error: 'Student with this USN or Email already exists' });
    }

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
  } catch (error) {
    next(error);
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

// Soft delete: the academic record (semester records, scores, alerts,
// progress logs) is kept, the student just stops appearing in listings.
export const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.student.update({
      where: { id },
      data: { status: 'DROPPED' }
    });
    res.json({ message: 'Student marked as dropped' });
  } catch (error) {
    next(error);
  }
};
