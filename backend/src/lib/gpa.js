// SGPA and CGPA are credit-weighted averages of grade points. The grade scale
// lives in the GradeBand table so a college can set its own without a code
// change; DEFAULT_BANDS is only a fallback for an unseeded database.
export const DEFAULT_BANDS = [
  { label: 'S', minScore: 90, gradePoint: 10 },
  { label: 'A', minScore: 80, gradePoint: 9 },
  { label: 'B', minScore: 70, gradePoint: 8 },
  { label: 'C', minScore: 60, gradePoint: 7 },
  { label: 'D', minScore: 50, gradePoint: 6 },
  { label: 'E', minScore: 40, gradePoint: 5 },
  { label: 'F', minScore: 0, gradePoint: 0 },
];

export const loadGradeBands = async (client) => {
  const bands = await client.gradeBand.findMany({ orderBy: { minScore: 'desc' } });
  return bands.length > 0 ? bands : DEFAULT_BANDS;
};

// Highest band whose threshold the score reaches.
export const gradeFor = (finalScore, bands) => {
  const ordered = [...bands].sort((a, b) => b.minScore - a.minScore);
  return ordered.find(band => finalScore >= band.minScore) ?? { label: 'F', gradePoint: 0 };
};

const round = (value) => Math.round(value * 100) / 100;

// A failed subject still consumes its credits, which is how universities
// compute SGPA: credits attempted, not credits earned.
export const weightedAverage = (entries) => {
  const credits = entries.reduce((sum, entry) => sum + entry.credits, 0);
  if (credits === 0) return null;

  const points = entries.reduce((sum, entry) => sum + (entry.credits * entry.gradePoint), 0);
  return round(points / credits);
};

const entriesForRecord = (record, bands) =>
  record.scores
    .filter(score => score.finalScore !== null && score.finalScore !== undefined)
    .map(score => ({
      credits: score.subject?.credits ?? 0,
      gradePoint: gradeFor(score.finalScore, bands).gradePoint,
    }));

export const computeSgpa = async (client, semesterRecordId) => {
  const bands = await loadGradeBands(client);

  const record = await client.semesterRecord.findUnique({
    where: { id: semesterRecordId },
    select: { id: true, scores: { select: { finalScore: true, subject: { select: { credits: true } } } } },
  });

  if (!record) return null;
  return weightedAverage(entriesForRecord(record, bands));
};

export const computeCgpa = async (client, studentId) => {
  const bands = await loadGradeBands(client);

  const records = await client.semesterRecord.findMany({
    where: { studentId },
    select: { id: true, scores: { select: { finalScore: true, subject: { select: { credits: true } } } } },
  });

  return weightedAverage(records.flatMap(record => entriesForRecord(record, bands)));
};

// Recomputes SGPA for the given semester records and the running CGPA for
// every semester of the affected students. Takes a transaction client so a
// bulk save or import stays atomic.
export const updateGpaForSemesterRecords = async (client, semesterRecordIds) => {
  const ids = [...new Set(semesterRecordIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const touched = await client.semesterRecord.findMany({
    where: { id: { in: ids } },
    select: { studentId: true },
  });

  return updateGpaForStudents(client, touched.map(record => record.studentId));
};

export const updateGpaForStudents = async (client, studentIds) => {
  const ids = [...new Set(studentIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const bands = await loadGradeBands(client);
  const updated = [];

  for (const studentId of ids) {
    const records = await client.semesterRecord.findMany({
      where: { studentId },
      orderBy: [{ academicYear: 'asc' }, { semester: 'asc' }],
      select: { id: true, scores: { select: { finalScore: true, subject: { select: { credits: true } } } } },
    });

    // CGPA is cumulative, so each semester stores the figure as it stood at
    // the end of that semester - which is what a transcript shows.
    const running = [];

    for (const record of records) {
      const entries = entriesForRecord(record, bands);
      running.push(...entries);

      const sgpa = weightedAverage(entries);
      const cgpa = weightedAverage(running);

      await client.semesterRecord.update({
        where: { id: record.id },
        data: { sgpa, cgpa },
      });

      updated.push({ semesterRecordId: record.id, sgpa, cgpa });
    }
  }

  return updated;
};

// The latest cumulative figure for a student, i.e. their current CGPA.
export const currentCgpa = (semesterRecords) => {
  const withCgpa = [...semesterRecords]
    .filter(record => record.cgpa !== null && record.cgpa !== undefined)
    .sort((a, b) => (a.academicYear - b.academicYear) || (a.semester - b.semester));

  return withCgpa.length > 0 ? withCgpa[withCgpa.length - 1].cgpa : null;
};
