import prisma from '../prismaClient.js';
import { requireDepartment, ensureDepartment } from '../lib/departments.js';
import { assertCan, NotFoundError } from '../lib/access.js';

export const createSubject = async (req, res, next) => {
  try {
    const { name, code, department, academicYear, semester } = req.body;
    
    const existing = await prisma.subject.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Subject code must be unique' });
    }

    const departmentRow = await ensureDepartment(prisma, department);
    await assertCan(req.user, 'subject:write', { departmentId: departmentRow.id },
      'You can only manage subjects in your own department.');

    const subject = await prisma.subject.create({
      data: { 
        name, 
        code, 
        department: departmentRow.code,
        departmentId: departmentRow.id, 
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

    const current = await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } });
    if (!current) throw new NotFoundError('Subject not found.');
    await assertCan(req.user, 'subject:write', current, 'You can only manage subjects in your own department.');

    const departmentRow = department ? await ensureDepartment(prisma, department) : null;
    if (departmentRow) {
      await assertCan(req.user, 'subject:write', { departmentId: departmentRow.id },
        'You can only move a subject into your own department.');
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: { 
        name, 
        code, 
        ...(departmentRow ? { department: departmentRow.code, departmentId: departmentRow.id } : {}), 
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

    const current = await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } });
    if (!current) throw new NotFoundError('Subject not found.');
    await assertCan(req.user, 'subject:write', current, 'You can only manage subjects in your own department.');
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
    if (department) whereClause.departmentId = (await requireDepartment(department)).id;
    if (academicYear) whereClause.academicYear = Number(academicYear);

    const subjects = await prisma.subject.findMany({ where: whereClause });
    res.json(subjects);
  } catch (error) {
    next(error);
  }
};
