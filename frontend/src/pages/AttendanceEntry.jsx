import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, AlertTriangle, CheckCircle2, X, CalendarCheck } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/EmptyState';
import './MarksEntry.css';

const CURRENT_YEAR = new Date().getFullYear();
const COLUMNS = [
  { key: 'classesHeld', label: 'Classes held' },
  { key: 'classesAttended', label: 'Classes attended' },
];

// Mirrors the thresholds in backend/src/lib/scoring.js.
const CRITICAL = 75;
const WARNING = 85;

const cellProblem = (row, key, value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return 'Whole numbers only';
  if (n < 0) return 'Cannot be negative';
  if (key === 'classesAttended' && row.classesHeld !== '' && n > Number(row.classesHeld)) {
    return 'More than held';
  }
  return null;
};

const percentOf = (row) => {
  const held = Number(row.classesHeld);
  const attended = Number(row.classesAttended);
  if (!held || Number.isNaN(attended)) return null;
  return Math.round((attended / held) * 1000) / 10;
};

const AttendanceEntry = () => {
  const [filters, setFilters] = useState({
    department: '',
    semester: '3',
    academicYear: String(CURRENT_YEAR),
    subjectId: '',
  });

  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [subjects, setSubjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const cellRefs = useRef({});

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

  const draftKey = `${filters.subjectId}|${filters.semester}|${filters.academicYear}`;

  const loadClass = async ({ useDraft = true, keepResult = false } = {}) => {
    if (!filters.department || !filters.subjectId) {
      setError('Pick a department and a subject first.');
      return;
    }

    setLoading(true);
    setError('');
    if (!keepResult) setResult(null);

    try {
      const { data } = await api.get('/attendance/class', { params: filters });
      const stored = useDraft ? draft[draftKey] : null;
      setRows(stored ? mergeDraft(data.rows, stored) : data.rows);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the class list.');
      setRows([]);
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  const updateCell = (studentId, key, value) => {
    setRows(previous => {
      const next = previous.map(row => (row.studentId === studentId ? { ...row, [key]: value } : row));
      setDraft(drafts => ({ ...drafts, [draftKey]: next }));
      return next;
    });
  };

  const focusCell = (rowIndex, columnKey) => {
    const target = cellRefs.current[`${rowIndex}|${columnKey}`];
    if (target) {
      target.focus();
      target.select?.();
    }
  };

  const onKeyDown = (event, rowIndex, columnIndex) => {
    const columnKey = COLUMNS[columnIndex].key;
    const move = (rowDelta, columnDelta) => {
      event.preventDefault();
      const nextColumn = COLUMNS[columnIndex + columnDelta];
      focusCell(rowIndex + rowDelta, nextColumn ? nextColumn.key : columnKey);
    };

    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey && columnIndex === COLUMNS.length - 1)) {
      return move(1, 0);
    }
    if (event.key === 'ArrowDown') return move(1, 0);
    if (event.key === 'ArrowUp') return move(-1, 0);
    if (event.key === 'ArrowRight' && event.target.selectionStart === event.target.value.length) return move(0, 1);
    if (event.key === 'ArrowLeft' && event.target.selectionStart === 0) return move(0, -1);
  };

  // Same Excel-block paste behaviour as the marks grid.
  const onPaste = (event, rowIndex, columnIndex) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text || !/[\t\r\n]/.test(text)) return;

    event.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter(line => line !== '');

    setRows(previous => {
      const next = previous.map(row => ({ ...row }));

      lines.forEach((line, lineIndex) => {
        const targetRow = next[rowIndex + lineIndex];
        if (!targetRow) return;

        line.split('\t').forEach((value, valueIndex) => {
          const column = COLUMNS[columnIndex + valueIndex];
          if (column) targetRow[column.key] = value.trim();
        });
      });

      setDraft(drafts => ({ ...drafts, [draftKey]: next }));
      return next;
    });
  };

  const problems = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      for (const column of COLUMNS) {
        const problem = cellProblem(row, column.key, row[column.key]);
        if (problem) map.set(`${row.studentId}|${column.key}`, problem);
      }
    }
    return map;
  }, [rows]);

  const touchedRows = useMemo(
    () => rows.filter(row => row.classesHeld !== '' && row.classesHeld !== null && row.classesAttended !== '' && row.classesAttended !== null),
    [rows]
  );

  const saveAll = async () => {
    if (problems.size > 0) {
      setError('Fix the highlighted cells before saving.');
      return;
    }
    if (touchedRows.length === 0) {
      setError('Enter classes held and attended for at least one student.');
      return;
    }

    setSaving(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.post('/attendance/bulk', {
        subjectId: filters.subjectId,
        semester: Number(filters.semester),
        academicYear: Number(filters.academicYear),
        asOfDate,
        rows: touchedRows.map(row => ({
          studentId: row.studentId,
          classesHeld: Number(row.classesHeld),
          classesAttended: Number(row.classesAttended),
        })),
      });

      setResult({ saved: data.saved });
      setDraft(drafts => {
        const next = { ...drafts };
        delete next[draftKey];
        return next;
      });
      await loadClass({ useDraft: false, keepResult: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const bandClass = (percent) => {
    if (percent === null || percent === undefined) return '';
    if (percent < CRITICAL) return 'attendance-critical';
    if (percent < WARNING) return 'attendance-warning';
    return 'attendance-ok';
  };

  return (
    <div className="marks-view">
      <header className="page-header marks-header">
        <div>
          <h1>Attendance entry</h1>
          <p className="text-muted">
            Classes held and attended per student for one subject. Below {CRITICAL}% raises a high alert, {CRITICAL}–{WARNING}% a medium one.
          </p>
        </div>
      </header>

      {error && (
        <div className="marks-banner marks-banner-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="btn-icon" onClick={() => setError('')} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      {result?.saved > 0 && (
        <div className="marks-banner marks-banner-success" role="status">
          <CheckCircle2 size={18} />
          <span>{result.saved} student{result.saved === 1 ? '' : 's'} saved.</span>
          <button className="btn-icon" onClick={() => setResult(null)} title="Dismiss"><X size={16} /></button>
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
          <label>Subject</label>
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

        <div className="form-group">
          <label>As of</label>
          <input
            type="date"
            className="input-control"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={() => loadClass()} disabled={loading} type="button">
          <CalendarCheck size={16} /> {loading ? 'Loading…' : 'Load class'}
        </button>
      </div>

      {loaded && (
        <div className="card marks-grid-card">
          <div className="marks-grid-head">
            <h3>{rows.length} student{rows.length === 1 ? '' : 's'}</h3>
            <div className="marks-grid-actions">
              {problems.size > 0 && (
                <span className="marks-problem-count">{problems.size} cell{problems.size === 1 ? '' : 's'} need fixing</span>
              )}
              <button
                className="btn btn-primary"
                onClick={saveAll}
                disabled={saving || problems.size > 0 || touchedRows.length === 0}
                type="button"
              >
                <Save size={16} /> {saving ? 'Saving…' : `Save all (${touchedRows.length})`}
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No students in that class"
              description="Nobody is enrolled in this department and semester yet, or none of them are yours."
              actionLabel="Import students"
              actionTo="/import?type=students"
            />
          ) : (
            <div className="table-responsive marks-table-wrap">
              <table className="data-table marks-table">
                <thead>
                  <tr>
                    <th>Roll number</th>
                    <th>Name</th>
                    {COLUMNS.map(column => <th key={column.key}>{column.label}</th>)}
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const percent = percentOf(row);
                    return (
                      <tr key={row.studentId}>
                        <td><strong>{row.rollNumber}</strong></td>
                        <td>{row.name}</td>
                        {COLUMNS.map((column, columnIndex) => {
                          const problem = problems.get(`${row.studentId}|${column.key}`);
                          return (
                            <td key={column.key} className="marks-cell">
                              <input
                                ref={element => { cellRefs.current[`${rowIndex}|${column.key}`] = element; }}
                                className={`marks-input ${problem ? 'is-invalid' : ''}`}
                                value={row[column.key] ?? ''}
                                inputMode="numeric"
                                title={problem || ''}
                                onChange={e => updateCell(row.studentId, column.key, e.target.value)}
                                onKeyDown={e => onKeyDown(e, rowIndex, columnIndex)}
                                onPaste={e => onPaste(e, rowIndex, columnIndex)}
                                onFocus={e => e.target.select()}
                              />
                              {problem && <span className="marks-cell-problem">{problem}</span>}
                            </td>
                          );
                        })}
                        <td className={bandClass(percent)}>
                          {percent === null ? <span className="text-muted">—</span> : `${percent}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const mergeDraft = (fresh, stored) => {
  const byId = new Map(stored.map(row => [row.studentId, row]));

  return fresh.map(row => {
    const typed = byId.get(row.studentId);
    if (!typed) return row;

    const merged = { ...row };
    for (const column of COLUMNS) merged[column.key] = typed[column.key];
    return merged;
  });
};

export default AttendanceEntry;
