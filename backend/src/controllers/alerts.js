import prisma from '../prismaClient.js';

export const getStudentAlerts = async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { semesterRecord: { studentId: req.params.studentId } },
      orderBy: { timestamp: 'desc' }
    });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMentorAlerts = async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        semesterRecord: {
          student: { mentorId: req.user.id }
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

export const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await prisma.alert.update({
      where: { id },
      data: { resolved: true }
    });
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
