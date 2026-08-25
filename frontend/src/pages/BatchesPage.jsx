import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, AlertTriangle, CheckCircle2, X, ArrowRight, History } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/EmptyState';
import './ImportPage.css';
import './MarksEntry.css';
import Modal from '../components/Modal';
import { useCardLabels } from '../hooks/useCardLabels';

const BatchesPage = () => {
  // Column names are copied onto the cells so the card layout below
  // 640px can label each value. See hooks/useCardLabels.js.
  const cardTable0 = useCardLabels();
  const [batches, setBatches] = useState([]);
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/departments/batches');
      setBatches(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Nothing is applied here: this is the review step.
  const openPreview = async (batch) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post(`/admin/batches/${batch.id}/promote/preview`);
      setPlan(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not work out what would change.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPromotion = async () => {
    if (!plan) return;

    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/admin/batches/${plan.batch.id}/promote`, {
        fromSemester: plan.fromSemester,
      });
      setResult(data);
      setPlan(null);
      await loadBatches();
    } catch (err) {
      setError(err.response?.data?.error || 'The promotion could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (batch) => {
    setBusy(true);
    try {
      const { data } = await api.get(`/admin/batches/${batch.id}/rollovers`);
      setHistory({ batch, rollovers: data });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the history.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1>Batches and semester rollover</h1>
          <p className="text-muted">
            Promoting a batch moves every active student on one semester. You see exactly what will happen first,
            and running it twice is refused rather than applied.
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
            {result.message}
            {result.rollover.graduated > 0 && ` ${result.rollover.graduated} graduated.`}
            {result.rollover.skipped > 0 && ` ${result.rollover.skipped} skipped.`}
          </span>
          <button className="btn-icon" onClick={() => setResult(null)} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="card marks-grid-card">
        {loading ? (
          <p className="text-muted marks-empty">Loading batches…</p>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No batches yet"
            description="A batch is one intake of students, created automatically from their admission year when you import them."
            actionLabel="Import students"
            actionTo="/import?type=students"
          />
        ) : (
          <div className="table-responsive">
            <table ref={cardTable0} className="data-table table-cards">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Admission year</th>
                  <th>Current semester</th>
                  <th>Students</th>
                  <th>Sections</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id}>
                    <td><strong>{batch.department.code}</strong> {batch.department.name}</td>
                    <td>{batch.admissionYear}</td>
                    <td>Semester {batch.currentSemester}</td>
                    <td>{batch.students}</td>
                    <td>{batch.sections.length > 0 ? batch.sections.map(s => s.name).join(', ') : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => openHistory(batch)}>
                          <History size={15} /> History
                        </button>
                        <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => openPreview(batch)}>
                          <GraduationCap size={15} /> Promote
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {plan && (
        <Modal
          size="lg"
          onClose={() => setPlan(null)}
          title={
            <>
              {plan.batch.department.code} {plan.batch.admissionYear}:
              semester {plan.fromSemester} <ArrowRight size={14} style={{ verticalAlign: 'middle' }} /> {plan.toSemester}
            </>
          }
          actions={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPlan(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || (plan.summary.promote === 0 && plan.summary.graduate === 0)}
                onClick={confirmPromotion}
              >
                {busy ? 'Applying…' : `Promote ${plan.summary.promote + plan.summary.graduate} student(s)`}
              </button>
            </>
          }
        >
            <div>
              <div className="import-summary">
                <div className="import-stat">
                  <label>Students</label>
                  <span>{plan.summary.total}</span>
                </div>
                <div className="import-stat">
                  <label>To promote</label>
                  <span className="is-create">{plan.summary.promote}</span>
                </div>
                <div className="import-stat">
                  <label>To graduate</label>
                  <span className="is-update">{plan.summary.graduate}</span>
                </div>
                <div className="import-stat">
                  <label>Skipped</label>
                  <span className={plan.summary.skip > 0 ? 'is-invalid' : ''}>{plan.summary.skip}</span>
                </div>
              </div>

              {plan.isFinal && (
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  This is the final semester, so these students will be marked graduated rather than promoted.
                </p>
              )}

              <div className="table-responsive import-table-wrap" style={{ maxHeight: '40vh' }}>
                <table className="data-table import-table">
                  <thead>
                    <tr>
                      <th>Roll number</th>
                      <th>Name</th>
                      <th>What happens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.promote.map(student => (
                      <tr key={student.id}>
                        <td><strong>{student.rollNumber}</strong></td>
                        <td>{student.name}</td>
                        <td>
                          <span className="import-pill is-create">
                            Semester {student.toSemester}, year {student.toYear} ({student.toAcademicYear})
                          </span>
                        </td>
                      </tr>
                    ))}
                    {plan.graduate.map(student => (
                      <tr key={student.id}>
                        <td><strong>{student.rollNumber}</strong></td>
                        <td>{student.name}</td>
                        <td><span className="import-pill is-update">Graduating</span></td>
                      </tr>
                    ))}
                    {plan.skip.map(student => (
                      <tr key={student.id} className="row-invalid">
                        <td><strong>{student.rollNumber}</strong></td>
                        <td>{student.name}</td>
                        <td className="import-problems">{student.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
        </Modal>
      )}

      {history && (
        <Modal
          size="md"
          onClose={() => setHistory(null)}
          title={`${history.batch.department.code} ${history.batch.admissionYear} — rollover history`}
        >
            <div>
              {history.rollovers.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '14px' }}>This batch has never been promoted.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Change</th>
                      <th>Promoted</th>
                      <th>Graduated</th>
                      <th>Skipped</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.rollovers.map(rollover => (
                      <tr key={rollover.id}>
                        <td>{new Date(rollover.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>Sem {rollover.fromSemester} → {rollover.toSemester}</td>
                        <td>{rollover.promoted}</td>
                        <td>{rollover.graduated}</td>
                        <td>{rollover.skipped}</td>
                        <td>{rollover.actor?.name || 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
        </Modal>
      )}
    </div>
  );
};

export default BatchesPage;
