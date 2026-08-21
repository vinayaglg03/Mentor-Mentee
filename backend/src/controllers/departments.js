import prisma from '../prismaClient.js';
import { ensureDepartment } from '../lib/departments.js';

export const listDepartments = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        hodId: true,
        _count: { select: { students: true, subjects: true, batches: true } },
      },
    });

    res.json(departments.map(department => ({
      id: department.id,
      code: department.code,
      name: department.name,
      hodId: department.hodId,
      students: department._count.students,
      subjects: department._count.subjects,
      batches: department._count.batches,
    })));
  } catch (error) {
    next(error);
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const { code, name } = req.body;
    const department = await ensureDepartment(prisma, code, name);
    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
};

// Batches, optionally for one department, with how many students each holds.
export const listBatches = async (req, res, next) => {
  try {
    const { departmentId } = req.query;

    const batches = await prisma.batch.findMany({
      where: departmentId ? { departmentId } : {},
      orderBy: [{ admissionYear: 'desc' }],
      include: {
        department: { select: { id: true, code: true, name: true } },
        sections: { select: { id: true, name: true, coordinatorId: true } },
        _count: { select: { students: true } },
      },
    });

    res.json(batches.map(batch => ({
      id: batch.id,
      admissionYear: batch.admissionYear,
      currentSemester: batch.currentSemester,
      department: batch.department,
      sections: batch.sections,
      students: batch._count.students,
    })));
  } catch (error) {
    next(error);
  }
};

export const createSection = async (req, res, next) => {
  try {
    const { batchId, name, coordinatorId } = req.body;

    const section = await prisma.section.create({
      data: { batchId, name: name.trim().toUpperCase(), coordinatorId: coordinatorId || null },
    });

    res.status(201).json(section);
  } catch (error) {
    next(error);
  }
};
