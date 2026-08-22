import * as students from './students.js';
import * as subjects from './subjects.js';
import * as marks from './marks.js';
import * as attendance from './attendance.js';
import * as faculty from './faculty.js';

// Each importer exposes: columns, instructions, validate({rows,user,prisma})
// and commit({rows,user,tx}). Adding a type means adding a module here.
export const importers = {
  students: { type: 'students', label: 'Students', ...students },
  subjects: { type: 'subjects', label: 'Subjects', ...subjects },
  marks: { type: 'marks', label: 'Marks', ...marks },
  attendance: { type: 'attendance', label: 'Attendance', ...attendance },
  faculty: { type: 'faculty', label: 'Faculty', ...faculty },
};

export const importTypes = Object.keys(importers);

export const getImporter = (type) => importers[type] ?? null;
