import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Building2, Users, GraduationCap, BookOpen, UserCheck, AlertTriangle, X } from 'lucide-react';
import api from '../services/api';
import './ImportPage.css';
import './MarksEntry.css';
import './SetupWizard.css';

const STEP_ICONS = {
  institution: Building2,
  departments: Building2,
  faculty: Users,
  students: GraduationCap,
  subjects: BookOpen,
  mentors: UserCheck,
};

const SetupWizard = () => {
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [institution, setInstitution] = useState({
    name: '', shortName: '', address: '', currentAcademicYear: new Date().getFullYear(),
  });
  const [department, setDepartment] = useState({ code: '', name: '' });
  const [assignment, setAssignment] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/setup/status');
      setStatus(data);

      if (data.institution) {
        setInstitution(current => ({
          ...current,
          name: data.institution.name || '',
          shortName: data.institution.shortName || '',
          address: data.institution.address || '',
          currentAcademicYear: data.institution.currentAcademicYear || new Date().getFullYear(),
        }));
      }

      // Resume where they left off: the first step that is not done.
      setActive(current => current ?? (data.steps.find(step => !step.done)?.key ?? 'institution'));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the setup status.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveInstitution = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await api.put('/setup/institution', institution);
      await load();
      setActive('departments');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const addDepartment = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await api.post('/departments', department);
      setDepartment({ code: '', name: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add that department.');
    } finally {
      setBusy(false);
    }
  };

  const previewAssignment = async () => {
    setBusy(true);
    setError('');

    try {
      const { data } = await api.post('/setup/assign-mentors', { preview: true });
      setAssignment(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not work out an assignment.');
    } finally {
      setBusy(false);
    }
  };

  const applyAssignment = async () => {
    setBusy(true);
    setError('');

    try {
      await api.post('/setup/assign-mentors', {});
      setAssignment(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not assign mentors.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    try {
      await api.post('/setup/complete');
    } catch {
      // Finishing is a convenience marker; not worth blocking on.
    }
    navigate('/hod/dashboard');
  };

  if (!status) {
    return <div className="setup-view"><p className="text-muted">Loading setup…</p></div>;
  }

  const step = (key) => status.steps.find(entry => entry.key === key);
  const done = status.steps.filter(entry => entry.done).length;

  // Every import step is the Phase 1 import page, opened on the right type
  // and told to come back here.
  const importStep = (type, label, blurb) => (
    <div className="setup-panel">
      <p>{blurb}</p>
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => navigate(`/import?type=${type}&return=/setup`)}
      >
        {label} <ArrowRight size={16} />
      </button>
    </div>
  );

  return (
    <div className="setup-view">
      <header className="page-header">
        <div>
          <h1>Set up AMIS</h1>
          <p className="text-muted">
            {done} of {status.steps.length} done. You can leave this at any time and pick it up where you left off.
          </p>
        </div>
        <button className="btn btn-link" type="button" onClick={() => navigate('/hod/dashboard')}>
          Continue later
        </button>
      </header>

      {error && (
        <div className="import-banner import-banner-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="btn-icon" onClick={() => setError('')} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="setup-progress" role="list">
        {status.steps.map(entry => {
          const Icon = STEP_ICONS[entry.key] || Check;
          return (
            <button
              key={entry.key}
              type="button"
              role="listitem"
              className={`setup-step ${active === entry.key ? 'is-active' : ''} ${entry.done ? 'is-done' : ''}`}
              onClick={() => setActive(entry.key)}
              aria-current={active === entry.key ? 'step' : undefined}
            >
              <span className="setup-step-icon">{entry.done ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="setup-step-label">{entry.label}</span>
              {entry.count > 0 && <span className="setup-step-count">{entry.count}</span>}
            </button>
          );
        })}
      </div>

      <div className="card setup-card">
        {active === 'institution' && (
          <form onSubmit={saveInstitution} className="setup-panel">
            <h3>What is this institution called?</h3>
            <p className="text-muted">This appears on every report and export you produce.</p>

            <div className="form-group">
              <label htmlFor="setup-name">Institution name</label>
              <input
                id="setup-name"
                className="input-control"
                required
                value={institution.name}
                onChange={e => setInstitution({ ...institution, name: e.target.value })}
                placeholder="Sri Venkateswara College of Engineering"
              />
            </div>

            <div className="setup-row">
              <div className="form-group">
                <label htmlFor="setup-short">Short name</label>
                <input
                  id="setup-short"
                  className="input-control"
                  value={institution.shortName}
                  onChange={e => setInstitution({ ...institution, shortName: e.target.value })}
                  placeholder="SVCE"
                />
              </div>

              <div className="form-group">
                <label htmlFor="setup-year">Current academic year</label>
                <input
                  id="setup-year"
                  type="number"
                  className="input-control"
                  value={institution.currentAcademicYear}
                  onChange={e => setInstitution({ ...institution, currentAcademicYear: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="setup-address">Address</label>
              <input
                id="setup-address"
                className="input-control"
                value={institution.address}
                onChange={e => setInstitution({ ...institution, address: e.target.value })}
                placeholder="City, State"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save and continue'} <ArrowRight size={16} />
            </button>
          </form>
        )}

        {active === 'departments' && (
          <div className="setup-panel">
            <h3>Add your departments</h3>
            <p className="text-muted">
              A department is what a HOD sees. {step('departments').count || 0} added so far.
            </p>

            <form onSubmit={addDepartment} className="setup-row">
              <div className="form-group">
                <label htmlFor="dept-code">Code</label>
                <input
                  id="dept-code"
                  className="input-control"
                  required
                  value={department.code}
                  onChange={e => setDepartment({ ...department, code: e.target.value })}
                  placeholder="CSE"
                />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="dept-name">Name</label>
                <input
                  id="dept-name"
                  className="input-control"
                  value={department.name}
                  onChange={e => setDepartment({ ...department, name: e.target.value })}
                  placeholder="Computer Science and Engineering"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>Add</button>
            </form>

            {step('departments').done && (
              <button className="btn btn-outline" type="button" onClick={() => setActive('faculty')}>
                Continue <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}

        {active === 'faculty' && importStep(
          'faculty',
          'Import faculty',
          'A spreadsheet of names, emails and roles. They sign in with their college Google account, so there are no passwords to send anybody.'
        )}

        {active === 'students' && importStep(
          'students',
          'Import students',
          'Name, roll number, department, enrollment year and current semester. Departments and batches are created as needed.'
        )}

        {active === 'subjects' && importStep(
          'subjects',
          'Import subjects',
          'Code, name, department, semester and credits. Credits are what SGPA and CGPA are calculated from.'
        )}

        {active === 'mentors' && (
          <div className="setup-panel">
            <h3>Assign mentors</h3>
            <p className="text-muted">
              {step('mentors').remaining > 0
                ? `${step('mentors').remaining} student(s) have no mentor yet.`
                : 'Every student has a mentor.'}
            </p>

            {step('mentors').remaining > 0 && !assignment && (
              <button className="btn btn-primary" type="button" onClick={previewAssignment} disabled={busy}>
                {busy ? 'Working…' : 'Distribute evenly'}
              </button>
            )}

            {assignment && (
              <>
                <div className="import-summary">
                  <div className="import-stat">
                    <label>To assign</label>
                    <span className="is-create">{assignment.summary.toAssign}</span>
                  </div>
                  <div className="import-stat">
                    <label>Cannot place</label>
                    <span className={assignment.summary.unplaced > 0 ? 'is-invalid' : ''}>{assignment.summary.unplaced}</span>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr><th>Mentor</th><th>Now</th><th>After</th><th>Cap</th></tr>
                    </thead>
                    <tbody>
                      {assignment.summary.perMentor.map(mentor => (
                        <tr key={mentor.id}>
                          <td>{mentor.name}</td>
                          <td>{mentor.before}</td>
                          <td><strong>{mentor.after}</strong></td>
                          <td>{mentor.cap}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="setup-row">
                  <button className="btn btn-outline" type="button" onClick={() => setAssignment(null)}>Cancel</button>
                  <button className="btn btn-primary" type="button" onClick={applyAssignment} disabled={busy}>
                    {busy ? 'Assigning…' : `Assign ${assignment.summary.toAssign} student(s)`}
                  </button>
                </div>
              </>
            )}

            {status.complete && (
              <button className="btn btn-primary mt-2" type="button" onClick={finish}>
                Finish setup <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {status.complete && active !== 'mentors' && (
        <div className="import-banner import-banner-success" role="status">
          <Check size={18} />
          <span>Everything is set up.</span>
          <button className="btn btn-primary btn-sm" type="button" onClick={finish}>Go to the dashboard</button>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
