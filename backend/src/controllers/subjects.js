import prisma from '../prismaClient.js';

export const createSubject = async (req, res, next) => {
  try {
    const { name, code, department, academicYear, semester } = req.body;
    
    const existing = await prisma.subject.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Subject code must be unique' });
    }

    const subject = await prisma.subject.create({
      data: { 
        name, 
        code, 
        department, 
        academicYear: parseInt(academicYear) || new Date().getFullYear(), 
        semester: parseInt(semester) || 1 
      }
    });
    res.status(201).json(subject);
  } catch (error) {
    next(error);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, department, academicYear, semester } = req.body;

    const subject = await prisma.subject.update({
      where: { id },
      data: { 
        name, 
        code, 
        department, 
        academicYear: academicYear ? Number(academicYear) : undefined, 
        semester: semester ? Number(semester) : undefined 
      }
    });
    res.json(subject);
  } catch (error) {
    next(error);
  }
};

export const deleteSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.subject.delete({ where: { id } });
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    const { department, academicYear } = req.query;
    const whereClause = {};
    if (department) whereClause.department = department;
    if (academicYear) whereClause.academicYear = Number(academicYear);

    const subjects = await prisma.subject.findMany({ where: whereClause });
    res.json(subjects);
  } catch (error) {
    next(error);
  }
};
