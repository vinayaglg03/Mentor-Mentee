import prisma from '../prismaClient.js';
import { assertCan, NotFoundError } from '../lib/access.js';
import { planPromotion, applyPromotion } from '../lib/rollover.js';

const batchOr404 = async (batchId) => {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, departmentId: true, currentSemester: true },
  });

  if (!batch) throw new NotFoundError('Batch not found.');
  return batch;
};

// What would happen, in full, including who is skipped and why.
export const previewPromotion = async (req, res, next) => {
  try {
    const batch = await batchOr404(req.params.id);
    await assertCan(req.user, 'batch:promote', batch, 'You can only promote batches in your own department.');

    const plan = await planPromotion(prisma, batch.id);
    res.json(plan);
  } catch (error) {
    next(error);
  }
};

// Applies it. `fromSemester` is echoed back from the preview so a stale
// review, or a second click, is refused rather than promoting twice.
export const promoteBatch = async (req, res, next) => {
  try {
    const batch = await batchOr404(req.params.id);
    await assertCan(req.user, 'batch:promote', batch, 'You can only promote batches in your own department.');

    const result = await prisma.$transaction(
      (tx) => applyPromotion(tx, {
        batchId: batch.id,
        actorId: req.user.id,
        expectedFromSemester: req.body.fromSemester,
      }),
      { timeout: 120000, maxWait: 15000 }
    );

    res.json({
      message: `Promoted ${result.rollover.promoted} student(s) to semester ${result.rollover.toSemester}.`,
      rollover: result.rollover,
      summary: result.plan.summary,
      skipped: result.plan.skip.map(student => ({
        rollNumber: student.rollNumber,
        name: student.name,
        reason: student.reason,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const listRollovers = async (req, res, next) => {
  try {
    const batch = await batchOr404(req.params.id);
    await assertCan(req.user, 'batch:promote', batch);

    const rollovers = await prisma.semesterRollover.findMany({
      where: { batchId: batch.id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true } } },
    });

    res.json(rollovers);
  } catch (error) {
    next(error);
  }
};
