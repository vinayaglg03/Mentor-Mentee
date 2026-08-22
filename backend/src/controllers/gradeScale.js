import prisma from '../prismaClient.js';
import { DEFAULT_BANDS } from '../lib/gpa.js';

export const getGradeScale = async (req, res, next) => {
  try {
    const bands = await prisma.gradeBand.findMany({
      orderBy: { minScore: 'desc' },
      select: { id: true, label: true, minScore: true, gradePoint: true },
    });

    res.json({ bands: bands.length > 0 ? bands : DEFAULT_BANDS, isDefault: bands.length === 0 });
  } catch (error) {
    next(error);
  }
};

// Replaces the whole scale in one transaction: a half-applied scale would
// silently change everybody's GPA.
export const replaceGradeScale = async (req, res, next) => {
  try {
    const { bands } = req.body;

    const saved = await prisma.$transaction(async (tx) => {
      await tx.gradeBand.deleteMany({});
      await tx.gradeBand.createMany({ data: bands });
      return tx.gradeBand.findMany({
        orderBy: { minScore: 'desc' },
        select: { id: true, label: true, minScore: true, gradePoint: true },
      });
    });

    res.json({
      message: 'Grade scale updated. Run the GPA backfill to apply it to existing records.',
      bands: saved,
    });
  } catch (error) {
    next(error);
  }
};
