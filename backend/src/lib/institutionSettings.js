import prisma from '../prismaClient.js';

// The one shared row of institution settings, cached.
//
// The alert engine reads these on every attendance save, which happens once
// per student per subject during a bulk import - several thousand times in a
// row. A query each time would be the slowest part of the import, and the
// values change perhaps twice a year.
//
// Anything that writes the row calls invalidate(), so a change is visible on
// the next save rather than after a restart.

export const DEFAULTS = Object.freeze({
  attendanceCritical: 75,
  attendanceWarning: 85,
  markConcernPercent: 40,
});

let cached = null;
let cachedAt = 0;

// Short enough that a change made on another instance is picked up quickly,
// long enough that an import does not re-read it thousands of times.
const TTL_MS = 30_000;

export const invalidateInstitutionSettings = () => {
  cached = null;
  cachedAt = 0;
};

export const getInstitutionSettings = async () => {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  let row = null;

  try {
    row = await prisma.institution.findUnique({ where: { id: 'singleton' } });
  } catch {
    // A database blip must not stop marks being saved: fall back to the
    // documented defaults rather than throwing from inside the alert engine.
    return cached || DEFAULTS;
  }

  cached = {
    attendanceCritical: row?.attendanceCritical ?? DEFAULTS.attendanceCritical,
    attendanceWarning: row?.attendanceWarning ?? DEFAULTS.attendanceWarning,
    markConcernPercent: row?.markConcernPercent ?? DEFAULTS.markConcernPercent,
  };
  cachedAt = Date.now();

  return cached;
};
