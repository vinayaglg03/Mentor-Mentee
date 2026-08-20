import prisma from '../prismaClient.js';
import { assertCanAccessStudent, assertCanAccessAlert } from '../lib/access.js';

export const getStudentAlerts = async (req, res, next) => {
  try {
    await assertCanAccessStudent(req.user, req.params.studentId);

    const alerts = await prisma.alert.findMany({
      where: { semesterRecord: { studentId: req.params.studentId } },
      orderBy: { timestamp: 'desc' }
    });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
};

export const getMentorAlerts = async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        semesterRecord: {
          student: { status: 'ACTIVE', mentorId: req.user.id }
        }
      },
      include: {
        semesterRecord: { 
          include: { student: { select: { name: true, rollNumber: true } } } 
        }
      },
      orderBy: { timestamp: 'desc' }
    });
    
    const flattened = alerts.map(a => ({
      ...a,
      student: a.semesterRecord.student
    }));
    
    res.json(flattened);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllAlerts = async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { semesterRecord: { student: { status: 'ACTIVE' } } },
      include: {
        semesterRecord: { 
          include: { student: { select: { name: true, rollNumber: true, department: true } } } 
        }
      },
      orderBy: { timestamp: 'desc' }
    });
    
    const flattened = alerts.map(a => ({
      ...a,
      student: a.semesterRecord.student
    }));
    
    res.json(flattened);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;

    await assertCanAccessAlert(req.user, id);

    const alert = await prisma.alert.update({
      where: { id },
      data: { resolved: true }
    });
    res.json(alert);
  } catch (error) {
    next(error);
  }
};
