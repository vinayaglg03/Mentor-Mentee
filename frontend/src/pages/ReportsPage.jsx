import React, { useEffect, useMemo, useState } from 'react';
import { FileText, FileSpreadsheet, AlertTriangle, X, Download } from 'lucide-react';
import api from '../services/api';
import { downloadFile } from '../services/download';
import './ImportPage.css';
import './MarksEntry.css';

const CURRENT_YEAR = new Date().getFullYear();

const ReportsPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [filters, setFilters] = useState({
    department: '',
    semester: '3',
    academicYear: String(CURRENT_YEAR),
    subjectId: '',
  });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/subjects'), api.get('/departments')])
      .then(([subjectList, departmentList]) => {
        setSubjects(subjectList.data);
        setDepartments(departmentList.data);
      })
      .catch(() => setError('Could not load subjects and departments.'));
  }, []);

  const subjectOptions = useMemo(
    () => subjects.filter(s =>
      (!filters.department || s.department === filters.department) &&
      (!filters.semester || String(s.semester) === String(filters.semester))
    ),
    [subjects, filters.department, filters.semester]
  );

  const run = async (key, path, params, fileName) => {
    setBusy(key);
    setError('');
    try {
      await downloadFile(path, params, fileName);
    } catch (err) {
      setError(err.response?.data?.error || 'That export could not be produced.');
    } finally {
      setBusy('');
    }
  };

  const needsClass = !filters.department;

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1>Reports and exports</h1>
          <p className="text-muted">
            Printable documents for review meetings, records and audits. Mentors export their own mentees; HODs export the department.
          </p>
        </div>
      </header>

      {error && (
        <div className="import-banner import-banner-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="btn-icon" onClick={() => setError('')} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="card marks-filters">
        <div className="form-group">
          <label>Department</label>
          <select
            className="input-control"
            value={filters.department}
            onChange={e => setFilters({ ...filters, department: e.target.value, subjectId: '' })}
          >
            <option value="">Select…</option>
            {departments.map(department => (
              <option key={department.id} value={department.code}>{department.code} — {department.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Semester</label>
          <select
            className="input-control"
            value={filters.semester}
            onChange={e => setFilters({ ...filters, semester: e.target.value, subjectId: '' })}
          >
            {Array.from({ length: 8 }, (_, i) => i + 1).map(semester => (
              <option key={semester} value={semester}>{semester}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Academic year</label>
          <input
            type="number"
            className="input-control"
            value={filters.academicYear}
            onChange={e => setFilters({ ...filters, academicYear: e.target.value })}
          />
        </div>

        <div className="form-group marks-subject">
          <label>Subject (marks sheet only)</label>
          <select
            className="input-control"
            value={filters.subjectId}
            onChange={e => setFilters({ ...filters, subjectId: e.target.value })}
          >
            <option value="">Select…</option>
            {subjectOptions.map(subject => (
              <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="import-types" style={{ marginTop: '1.5rem' }}>
        <div className="import-type">
          <FileText size={18} />
          <span className="import-type-label">Class performance summary (PDF)</span>
          <span className="import-type-blurb">
            Pass/fail split, subject-wise averages, at-risk count and a mentor-wise breakdown for review meetings.
          </span>
          <span style={{ gridColumn: 2, marginTop: '0.75rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={needsClass || busy === 'class'}
              onClick={() => run(
                'class',
                '/reports/class-summary.pdf',
                { department: filters.department, semester: filters.semester, academicYear: filters.academicYear },
                `class-summary-sem${filters.semester}-${filters.academicYear}.pdf`
              )}
            >
              <Download size={16} /> {busy === 'class' ? 'Preparing…' : 'Download'}
            </button>
          </span>
        </div>

        <div className="import-type">
          <FileSpreadsheet size={18} />
          <span className="import-type-label">At-risk students (Excel)</span>
          <span className="import-type-blurb">
            Roll number, name, mentor, open alerts, attendance % and CGPA. Department and semester are optional filters.
          </span>
          <span style={{ gridColumn: 2, marginTop: '0.75rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy === 'at-risk'}
              onClick={() => run(
                'at-risk',
                '/reports/at-risk.xlsx',
                {
                  ...(filters.department ? { department: filters.department } : {}),
                  ...(filters.semester ? { semester: filters.semester } : {}),
                },
                'at-risk-students.xlsx'
              )}
            >
              <Download size={16} /> {busy === 'at-risk' ? 'Preparing…' : 'Download'}
            </button>
          </span>
        </div>

        <div className="import-type">
          <FileSpreadsheet size={18} />
          <span className="import-type-label">Semester marks sheet (Excel)</span>
          <span className="import-type-blurb">
            The class grid for one subject, with class average, highest, lowest and the pass/fail count.
          </span>
          <span style={{ gridColumn: 2, marginTop: '0.75rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={needsClass || !filters.subjectId || busy === 'marks'}
              onClick={() => run(
                'marks',
                '/reports/marks-sheet.xlsx',
                filters,
                `marks-sheet-sem${filters.semester}-${filters.academicYear}.xlsx`
              )}
            >
              <Download size={16} /> {busy === 'marks' ? 'Preparing…' : 'Download'}
            </button>
          </span>
        </div>
      </div>

      <p className="text-muted" style={{ marginTop: '1.5rem', fontSize: '13px' }}>
        Per-mentee mentoring reports are produced from a student's profile page.
      </p>
    </div>
  );
};

export default ReportsPage;
