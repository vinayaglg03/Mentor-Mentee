import React, { useMemo, useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import api from '../services/api';
import { downloadFile } from '../services/download';
import './ImportPage.css';

const IMPORT_TYPES = [
  {
    key: 'students',
    label: 'Students',
    blurb: 'Add or update your mentees. Existing roll numbers are updated, not duplicated.',
  },
  {
    key: 'subjects',
    label: 'Subjects',
    blurb: 'Subject codes, departments, semesters and credits. Credits feed SGPA and CGPA.',
  },
  {
    key: 'marks',
    label: 'Marks',
    blurb: 'CIE, assignment and exam marks per student per subject. Alerts are raised automatically.',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    blurb: 'Classes held and attended per subject. Below 75% raises a high alert.',
  },
];

const ACCEPT = '.xlsx,.csv';

const ImportPage = () => {
  const [type, setType] = useState('students');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const activeType = IMPORT_TYPES.find(t => t.key === type);

  // Row number -> the problems found on it, so the table can show them inline.
  const errorsByRow = useMemo(() => {
    const map = new Map();
    for (const problem of preview?.errors || []) {
      if (!map.has(problem.rowNumber)) map.set(problem.rowNumber, []);
      map.get(problem.rowNumber).push(problem);
    }
    return map;
  }, [preview]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const changeType = (next) => {
    setType(next);
    reset();
  };

  const downloadTemplate = async () => {
    setError('');
    try {
      await downloadFile(`/import/${type}/template`, undefined, `amis-${type}-template.xlsx`);
    } catch {
      setError('Could not download the template.');
    }
  };

  // Re-uploading replaces the preview, so a user fixes their spreadsheet and
  // drops it again rather than starting over.
  const uploadFile = async (selected) => {
    if (!selected) return;

    setFile(selected);
    setPreview(null);
    setResult(null);
    setError('');
    setBusy(true);

    const form = new FormData();
    form.append('file', selected);

    try {
      const { data } = await api.post(`/import/${type}/preview`, form);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.error || 'The file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!preview) return;

    setBusy(true);
    setError('');

    try {
      const { data } = await api.post(`/import/${type}/commit`, { importId: preview.importId });
      setResult(data);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'The import could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    uploadFile(event.dataTransfer.files?.[0]);
  };

  const summary = preview?.summary;
  const blocked = !summary || summary.invalid > 0 || summary.total === 0;

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1>Bulk import</h1>
          <p className="text-muted">
            Upload a spreadsheet, check what will change, then apply it. Nothing is saved until you press import.
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

      {result && (
        <div className="import-banner import-banner-success" role="status">
          <CheckCircle2 size={18} />
          <span>
            {result.message}: {result.created} created, {result.updated} updated from {result.fileName}.
          </span>
          <button className="btn-icon" onClick={() => setResult(null)} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="import-types">
        {IMPORT_TYPES.map(option => (
          <button
            key={option.key}
            className={`import-type ${type === option.key ? 'is-active' : ''}`}
            onClick={() => changeType(option.key)}
            type="button"
          >
            <FileSpreadsheet size={18} />
            <span className="import-type-label">{option.label}</span>
            <span className="import-type-blurb">{option.blurb}</span>
          </button>
        ))}
      </div>

      <div className="card import-drop-card">
        <div className="import-actions">
          <button className="btn btn-outline" onClick={downloadTemplate} type="button">
            <Download size={16} /> Download {activeType.label.toLowerCase()} template
          </button>
          <span className="text-muted import-hint">
            Fill the template, or upload the file your exam portal already produces.
          </span>
        </div>

        <div
          className={`import-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
        >
          <Upload size={28} />
          <p><strong>Drop your .xlsx or .csv here</strong></p>
          <p className="text-muted">or click to choose a file{file ? ` — currently: ${file.name}` : ''}</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />
        </div>

        {busy && <p className="text-muted import-busy">Working…</p>}
      </div>

      {preview && (
        <div className="card import-preview">
          <div className="import-summary">
            <div className="import-stat">
              <label>Rows</label>
              <span>{summary.total}</span>
            </div>
            <div className="import-stat">
              <label>To create</label>
              <span className="is-create">{summary.toCreate}</span>
            </div>
            <div className="import-stat">
              <label>To update</label>
              <span className="is-update">{summary.toUpdate}</span>
            </div>
            <div className="import-stat">
              <label>Invalid</label>
              <span className={summary.invalid > 0 ? 'is-invalid' : ''}>{summary.invalid}</span>
            </div>

            <button
              className="btn btn-primary import-commit"
              onClick={commitImport}
              disabled={blocked || busy}
              type="button"
            >
              Import {summary.total - summary.invalid} rows
            </button>
          </div>

          {summary.invalid > 0 && (
            <p className="import-fix-hint">
              {summary.invalid} row{summary.invalid === 1 ? '' : 's'} need fixing. Correct them in your
              spreadsheet and drop the file again — nothing has been saved.
            </p>
          )}

          <div className="table-responsive import-table-wrap">
            <table className="data-table import-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Action</th>
                  {preview.columns.map(column => <th key={column.key}>{column.header}</th>)}
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(row => {
                  const problems = errorsByRow.get(row.rowNumber) || [];
                  return (
                    <tr key={row.rowNumber} className={problems.length > 0 ? 'row-invalid' : ''}>
                      <td>{row.rowNumber}</td>
                      <td>
                        <span className={`import-pill is-${row.action}`}>{row.action}</span>
                      </td>
                      {preview.columns.map(column => (
                        <td key={column.key}>{formatCell(row.display?.[column.key])}</td>
                      ))}
                      <td className="import-problems">
                        {problems.map((problem, index) => (
                          <div key={index}>
                            <strong>{problem.column}:</strong> {problem.message}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const formatCell = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

export default ImportPage;
