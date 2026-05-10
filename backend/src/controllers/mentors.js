import prisma from '../prismaClient.js';

export const getMentors = async (req, res) => {
  try {
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR' },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { students: true } }
      }
    });
    res.json(mentors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAssignedStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { mentorId: req.user.id },
      include: {
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
    res.status(500).json({ error: error.message });
  }
};

export const addProgressLog = async (req, res) => {
  try {
    const { studentId, remark, semesterRecordId } = req.body;
    
    let targetSemId = semesterRecordId;
    
    if (!targetSemId) {
      // Find current active semester record
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: { semesterRecords: { orderBy: { semester: 'desc' }, take: 1 } }
      });
      targetSemId = student?.semesterRecords[0]?.id;
    }

    if (!targetSemId) return res.status(400).json({ error: 'No semester record found for student' });

    const log = await prisma.progressLog.create({
      data: {
        semesterRecordId: targetSemId,
        mentorId: req.user.id,
        remark
      }
    });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProgressLogs = async (req, res) => {
  try {
    const { studentId } = req.params;
    const logs = await prisma.progressLog.findMany({
      where: studentId ? { semesterRecord: { studentId } } : { mentorId: req.user.id },
      include: { 
        semesterRecord: { include: { student: { select: { name: true } } } },
        mentor: { select: { name: true } } 
      },
      orderBy: { date: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addAchievement = async (req, res) => {
  try {
    const { studentId, semesterRecordId, title, description } = req.body;
    
    let targetSemId = semesterRecordId;
    if (!targetSemId) {
       const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: { semesterRecords: { orderBy: { semester: 'desc' }, take: 1 } }
      });
      targetSemId = student?.semesterRecords[0]?.id;
    }

    if (!targetSemId) return res.status(400).json({ error: 'No semester record found for student' });

    const achievement = await prisma.achievement.create({
      data: {
        semesterRecordId: targetSemId,
        title,
        description
      }
    });
    res.status(201).json(achievement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const claimStudent = async (req, res) => {
  try {
    const { studentId } = req.body;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.mentorId) return res.status(400).json({ error: 'Student is already assigned to a mentor.' });

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { mentorId: req.user.id }
    });

    res.json({ message: 'Successfully claimed student', student: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
