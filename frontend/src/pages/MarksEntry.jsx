import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, AlertTriangle, CheckCircle2, X, Table2 } from 'lucide-react';
import api from '../services/api';
import './MarksEntry.css';

const CURRENT_YEAR = new Date().getFullYear();
const COLUMNS = [
  { key: 'test1', label: 'Test 1' },
  { key: 'test2', label: 'Test 2' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'exam', label: 'Exam' },
];

// Mirrors backend/src/lib/scoring.js so the grid can flag a bad cell as it is
// typed; the server still validates every save.
const limitsFor = (semester) =>
  Number(semester) === 1 || Number(semester) === 2
    ? { test1: 50, test2: 50, assignment: 0, exam: 50 }
    : { test1: 25, test2: 25, assignment: 25, exam: 50 };

const cellProblem = (semester, key, value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Not a number';
  if (n < 0) return 'Cannot be negative';

  const max = limitsFor(semester)[key];
  if (max === 0) return 'No assignment in semesters 1-2';
  if (n > max) return `Max ${max}`;
  return null;
};

const internalTotal = (semester, row) => {
  const t1 = Number(row.test1) || 0;
  const t2 = Number(row.test2) || 0;
  const assign = Number(row.assignment) || 0;
  const sem = Number(semester);
  return sem === 1 || sem === 2 ? (t1 + t2) / 2 : ((t1 + t2) / 2) + assign;
};

const MarksEntry = () => {
  const [filters, setFilters] = useState({
    department: '',
    semester: '3',
    academicYear: String(CURRENT_YEAR),
    subjectId: '',
  });

  const [subjects, setSubjects] = useState([]);
  const [rows, setRows] = useState([]);
  // Kept in memory only, so a misclick inside the page never loses typing.
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const cellRefs = useRef({});

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const { data } = await api.get('/subjects');
        setSubjects(data);
      } catch {
        setError('Could not load subjects.');
      }
    };
    fetchSubjects();
  }, []);

  const departments = useMemo(
    () => [...new Set(subjects.map(s => s.department).filter(Boolean))].sort(),
    [subjects]
  );

  const subjectOptions = useMemo(
    () => subjects.filter(s =>
      (!filters.department || s.department === filters.department) &&
      (!filters.semester || String(s.semester) === String(filters.semester))
    ),
    [subjects, filters.department, filters.semester]
  );

  const draftKey = `${filters.subjectId}|${filters.semester}|${filters.academicYear}`;

  // `useDraft` is false straight after a save: the typed values are now the
  // saved values, and re-applying the draft would mask what the server
  // computed. `keepResult` preserves the save confirmation across the refetch.
  const loadClass = async ({ useDraft = true, keepResult = false } = {}) => {
    if (!filters.department || !filters.subjectId) {
      setError('Pick a department and a subject first.');
      return;
    }

    setLoading(true);
    setError('');
    if (!keepResult) setResult(null);

    try {
      const { data } = await api.get('/scores/class', { params: filters });
      const stored = useDraft ? draft[draftKey] : null;
      // Unsaved typing for this exact class survives a reload of the grid.
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

  const updateCell = useCallback((studentId, key, value) => {
    setRows(previous => {
      const next = previous.map(row => (row.studentId === studentId ? { ...row, [key]: value } : row));
      setDraft(drafts => ({ ...drafts, [draftKey]: next }));
      return next;
    });
  }, [draftKey]);

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

  // Excel puts a tab/newline separated block on the clipboard, so a pasted
  // column (or block) fills downwards from the focused cell.
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
        const problem = cellProblem(filters.semester, column.key, row[column.key]);
        if (problem) map.set(`${row.studentId}|${column.key}`, problem);
      }
    }
    return map;
  }, [rows, filters.semester]);

  const touchedRows = useMemo(
    () => rows.filter(row => COLUMNS.some(column => row[column.key] !== '' && row[column.key] !== null)),
    [rows]
  );

  const saveAll = async () => {
    if (problems.size > 0) {
      setError('Fix the highlighted cells before saving.');
      return;
    }
    if (touchedRows.length === 0) {
      setError('Nothing to save yet.');
      return;
    }

    setSaving(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.post('/scores/bulk', {
        subjectId: filters.subjectId,
        semester: Number(filters.semester),
        academicYear: Number(filters.academicYear),
        rows: touchedRows.map(row => ({
          studentId: row.studentId,
          test1: row.test1 === '' ? 0 : Number(row.test1),
          test2: row.test2 === '' ? 0 : Number(row.test2),
          assignment: row.assignment === '' ? 0 : Number(row.assignment),
          exam: row.exam === '' ? null : Number(row.exam),
        })),
      });

      setResult({ saved: data.saved, failed: [] });
      setDraft(drafts => {
        const next = { ...drafts };
        delete next[draftKey];
        return next;
      });
      await loadClass({ useDraft: false, keepResult: true });
    } catch (err) {
      const details = err.response?.data?.details;
      if (Array.isArray(details)) {
        setResult({ saved: 0, failed: details });
        setError(err.response?.data?.error || 'Some rows were rejected; nothing was saved.');
      } else {
        setError(err.response?.data?.error || 'Could not save the marks.');
      }
    } finally {
      setSaving(false);
    }
  };

  const failedById = useMemo(
    () => new Map((result?.failed || []).map(entry => [entry.studentId, entry.message])),
    [result]
  );

  return (
    <div className="marks-view">
      <header className="page-header marks-header">
        <div>
          <h1>Class mark entry</h1>
          <p className="text-muted">
            One subject, every student, one save. Tab or Enter moves down the column; paste a column straight from Excel.
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
            {departments.map(department => <option key={department} value={department}>{department}</option>)}
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

        <button className="btn btn-primary" onClick={() => loadClass()} disabled={loading} type="button">
          <Table2 size={16} /> {loading ? 'Loading…' : 'Load class'}
        </button>
      </div>

      {loaded && (
        <div className="card marks-grid-card">
          <div className="marks-grid-head">
            <h3>{rows.length} student{rows.length === 1 ? '' : 's'}</h3>
            <div className="marks-grid-actions">
              {problems.size > 0 && (
                <span className="marks-problem-count">{problems.size} cell{problems.size === 1 ? '' : 's'} out of range</span>
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
            <p className="text-muted marks-empty">
              No students match that department and semester.
            </p>
          ) : (
            <div className="table-responsive marks-table-wrap">
              <table className="data-table marks-table">
                <thead>
                  <tr>
                    <th>Roll number</th>
                    <th>Name</th>
                    {COLUMNS.map(column => (
                      <th key={column.key}>
                        {column.label}
                        <span className="marks-max"> /{limitsFor(filters.semester)[column.key] || '—'}</span>
                      </th>
                    ))}
                    <th>Internal</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
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
                              inputMode="decimal"
                              disabled={limitsFor(filters.semester)[column.key] === 0}
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
                      <td>{internalTotal(filters.semester, row).toFixed(1)}</td>
                      <td className="marks-status">
                        {failedById.get(row.studentId)
                          ? <span className="marks-failed">{failedById.get(row.studentId)}</span>
                          : row.finalScore !== null && row.finalScore !== undefined
                            ? <span className="text-muted">saved · {row.finalScore}</span>
                            : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Keeps typed-but-unsaved values when the class list is refetched. Only the
// editable columns come from the draft; totals always come from the server.
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

export default MarksEntry;
