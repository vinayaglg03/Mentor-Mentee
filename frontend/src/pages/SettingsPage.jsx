import React, { useEffect, useMemo, useState } from 'react';
import {
  User, Palette, Bell, GraduationCap, Database, Building2, Info,
  AlertTriangle, CheckCircle2, X, Monitor, Sun, Moon, LogOut, Download,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { roleLabel, atLeast } from '../lib/permissions';
import { useToast } from '../components/useToast';
import { downloadFile } from '../services/download';
import './SettingsPage.css';

// Everything on this page is wired to something. A control that looks like a
// setting and changes nothing is the bug this whole phase is about, so where
// a feature is not available - password sign-in is off, the mailer is not
// configured - the control is not rendered at all, and the page says why.

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'academic', label: 'Academic defaults', icon: GraduationCap },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'institution', label: 'Institution', icon: Building2, adminOnly: true },
  { id: 'about', label: 'About', icon: Info },
];

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor, blurb: 'Follows your device' },
];

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable', blurb: 'Roomier rows, easier to scan' },
  { value: 'compact', label: 'Compact', blurb: 'About a third more rows on screen' },
];

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

const SettingsPage = () => {
  const { user, logoutEverywhere } = useAuth();
  const theme = useTheme();
  const toast = useToast();

  const [tab, setTab] = useState('account');
  const [preferences, setPreferences] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [institution, setInstitution] = useState(null);
  const [authOptions, setAuthOptions] = useState({ passwordEnabled: false, googleEnabled: false });
  const [pending, setPending] = useState([]);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = atLeast(user, 'HOD');
  const visibleTabs = useMemo(() => TABS.filter(item => !item.adminOnly || isAdmin), [isAdmin]);

  useEffect(() => {
    api.get('/preferences')
      .then(({ data }) => setPreferences(data))
      .catch(() => setError('Could not load your settings.'));

    api.get('/preferences/departments')
      .then(({ data }) => setDepartments(data))
      .catch(() => setDepartments([]));

    api.get('/preferences/institution')
      .then(({ data }) => setInstitution(data))
      .catch(() => setInstitution(null));

    api.get('/auth/config')
      .then(({ data }) => setAuthOptions(data))
      .catch(() => { /* Leave both off; the account tab then offers nothing. */ });

    api.get('/health')
      .then(({ data }) => setVersion(data?.version || null))
      .catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    api.get('/auth/users/pending')
      .then(({ data }) => setPending(Array.isArray(data) ? data : []))
      .catch(() => setPending([]));
  }, [isAdmin]);

  // Optimistic: the change is on screen before the request finishes, and it
  // stays there if the request fails - with a toast saying so.
  const savePreference = async (patch) => {
    const previous = preferences;
    setPreferences(current => ({ ...current, ...patch }));

    try {
      const { data } = await api.put('/preferences', patch);
      setPreferences(data);
    } catch (requestError) {
      setPreferences(previous);
      toast.error(requestError, 'Could not save that.');
    }
  };

  const saveInstitution = async (patch) => {
    setSaving(true);

    try {
      const { data } = await api.put('/preferences/institution', patch);
      setInstitution(data);
      toast.success('Saved.');
    } catch (requestError) {
      toast.error(requestError, 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-view">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted">
            {user?.name} · {roleLabel(user?.role)}
          </p>
        </div>
      </header>

      {error && (
        <div className="import-banner import-banner-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
          <button className="btn-icon" onClick={() => setError('')} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Settings sections">
          {visibleTabs.map(item => (
            <button
              key={item.id}
              type="button"
              className={`settings-tab ${tab === item.id ? 'is-active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {tab === 'account' && (
            <AccountTab
              user={user}
              department={departments.find(item => item.id === user?.departmentId)}
              authOptions={authOptions}
              logoutEverywhere={logoutEverywhere}
              toast={toast}
            />
          )}

          {tab === 'appearance' && (
            <AppearanceTab theme={theme} />
          )}

          {tab === 'notifications' && (
            <NotificationsTab preferences={preferences} onChange={savePreference} />
          )}

          {tab === 'academic' && (
            <AcademicTab
              preferences={preferences}
              departments={departments}
              onChange={savePreference}
            />
          )}

          {tab === 'data' && <DataTab toast={toast} />}

          {tab === 'institution' && isAdmin && (
            institution ? (
              <InstitutionTab
                institution={institution}
                pending={pending}
                setPending={setPending}
                saving={saving}
                onSave={saveInstitution}
                toast={toast}
              />
            ) : <p className="text-muted">Loading…</p>
          )}

          {tab === 'about' && <AboutTab version={version} institution={institution} />}
        </div>
      </div>
    </div>
  );
};

// --- Account -----------------------------------------------------------------

const AccountTab = ({ user, department, authOptions, logoutEverywhere, toast }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const changePassword = async (event) => {
    event.preventDefault();

    if (form.newPassword !== form.confirm) {
      toast.error(null, 'The two new passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success(data.message || 'Password changed.');
    } catch (error) {
      toast.error(error, 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    try {
      const result = await logoutEverywhere();
      toast.success(result?.message || 'Signed out of every session.');
    } catch {
      toast.error(null, 'Could not sign the other sessions out.');
    }
  };

  return (
    <>
      <section className="card settings-card">
        <h2>Your account</h2>
        <dl className="settings-facts">
          <div><dt>Name</dt><dd>{user?.name}</dd></div>
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
          <div><dt>Role</dt><dd><span className="badge badge-info">{roleLabel(user?.role)}</span></dd></div>
          <div>
            <dt>Department</dt>
            <dd>{department ? `${department.code} — ${department.name}` : 'Not assigned'}</dd>
          </div>
        </dl>
        <p className="text-muted settings-note">
          Your name, role and department are set by an administrator. Ask your head of
          department if any of them is wrong.
        </p>
      </section>

      {/* Rendered only where there is a password to change. Under Google-only
          sign-in this section does not exist rather than sitting there inert. */}
      {authOptions.passwordEnabled && (
        <section className="card settings-card">
          <h2>Change password</h2>
          <form onSubmit={changePassword} className="settings-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current password</label>
              <input
                id="currentPassword"
                className="input-control"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={e => setForm({ ...form, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                className="input-control"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={form.newPassword}
                onChange={e => setForm({ ...form, newPassword: e.target.value })}
                required
                aria-describedby="password-policy"
              />
              <p id="password-policy" className="text-muted settings-hint">
                At least 10 characters.
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">New password again</label>
              <input
                id="confirmPassword"
                className="input-control"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Changing…' : 'Change password'}
            </button>
            <p className="text-muted settings-hint">
              Every other device is signed out when the password changes.
            </p>
          </form>
        </section>
      )}

      <section className="card settings-card">
        <h2>Sessions</h2>
        <p className="text-muted">
          You stay signed in on this device until you sign out. If you have used AMIS on a
          shared or lost machine, end every session now - including this one.
        </p>
        <button className="btn btn-outline" type="button" onClick={signOutEverywhere}>
          <LogOut size={16} aria-hidden="true" /> Sign out everywhere
        </button>
      </section>
    </>
  );
};

// --- Appearance --------------------------------------------------------------

const AppearanceTab = ({ theme }) => (
  <>
    <section className="card settings-card">
      <h2>Theme</h2>
      <p className="text-muted">
        System follows whatever your device is set to, including when it changes at dusk.
      </p>

      <div className="settings-choices" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme.theme === option.value}
            className={`settings-choice ${theme.theme === option.value ? 'is-active' : ''}`}
            onClick={() => theme.setTheme(option.value)}
          >
            <option.icon size={20} aria-hidden="true" />
            <span className="settings-choice-label">{option.label}</span>
            {option.blurb && <span className="settings-choice-blurb">{option.blurb}</span>}
          </button>
        ))}
      </div>

      {theme.theme === 'system' && (
        <p className="text-muted settings-hint">
          Currently showing the {theme.resolvedTheme} theme.
        </p>
      )}
    </section>

    <section className="card settings-card">
      <h2>Density</h2>
      <div className="settings-choices" role="radiogroup" aria-label="Density">
        {DENSITY_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme.density === option.value}
            className={`settings-choice ${theme.density === option.value ? 'is-active' : ''}`}
            onClick={() => theme.setDensity(option.value)}
          >
            <span className="settings-choice-label">{option.label}</span>
            <span className="settings-choice-blurb">{option.blurb}</span>
          </button>
        ))}
      </div>
    </section>

    <section className="card settings-card">
      <h2>Motion</h2>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={theme.reduceMotion}
          onChange={event => theme.setReduceMotion(event.target.checked)}
        />
        <span>
          <strong>Reduce motion</strong>
          <span className="text-muted">
            Removes page transitions and animation.
            {theme.motionFollowsSystem && ' Currently following your device setting.'}
          </span>
        </span>
      </label>
    </section>
  </>
);

// --- Notifications -----------------------------------------------------------

const NotificationsTab = ({ preferences, onChange }) => {
  if (!preferences) return <p className="text-muted">Loading…</p>;

  const rows = [
    {
      key: 'notifyDailyDigest',
      title: 'Daily digest',
      blurb: 'One email each morning: your alerts, follow-ups due, and mentees nobody has spoken to.',
    },
    {
      key: 'notifyWeeklyDigest',
      title: 'Weekly digest',
      blurb: 'The same summary once a week instead. Heads of department also get the escalation list.',
    },
    {
      key: 'notifyHighSeverity',
      title: 'High-severity alerts',
      blurb: 'An email when a mentee crosses a serious threshold. Batched hourly, so a bulk import does not send forty of them.',
    },
  ];

  return (
    <section className="card settings-card">
      <h2>Email</h2>
      <p className="text-muted">
        Alerts always appear on your dashboard. These decide what also reaches your inbox.
      </p>

      <div className="settings-switches">
        {rows.map(row => (
          <label key={row.key} className="settings-switch">
            <input
              type="checkbox"
              checked={Boolean(preferences[row.key])}
              onChange={event => {
                const next = { [row.key]: event.target.checked };
                // Daily and weekly are the same digest at two rhythms;
                // turning one on turns the other off rather than sending both.
                if (row.key === 'notifyDailyDigest' && event.target.checked) {
                  next.notifyWeeklyDigest = false;
                }
                if (row.key === 'notifyWeeklyDigest' && event.target.checked) {
                  next.notifyDailyDigest = false;
                }
                onChange(next);
              }}
            />
            <span>
              <strong>{row.title}</strong>
              <span className="text-muted">{row.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
};

// --- Academic defaults -------------------------------------------------------

const AcademicTab = ({ preferences, departments, onChange }) => {
  if (!preferences) return <p className="text-muted">Loading…</p>;

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <section className="card settings-card">
      <h2>What the entry screens should assume</h2>
      <p className="text-muted">
        Mark entry, attendance entry and import open on these instead of three empty
        dropdowns. You can still change them on the page.
      </p>

      <div className="settings-grid">
        <div className="form-group">
          <label htmlFor="defaultDepartment">Department</label>
          <select
            id="defaultDepartment"
            className="input-control"
            value={preferences.defaultDepartmentId || ''}
            onChange={event => onChange({ defaultDepartmentId: event.target.value || null })}
          >
            <option value="">No default</option>
            {departments.map(department => (
              <option key={department.id} value={department.id}>
                {department.code} — {department.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="defaultSemester">Semester</label>
          <select
            id="defaultSemester"
            className="input-control"
            value={preferences.defaultSemester || ''}
            onChange={event => onChange({
              defaultSemester: event.target.value ? Number(event.target.value) : null,
            })}
          >
            <option value="">No default</option>
            {SEMESTERS.map(semester => (
              <option key={semester} value={semester}>Semester {semester}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="defaultAcademicYear">Academic year</label>
          <select
            id="defaultAcademicYear"
            className="input-control"
            value={preferences.defaultAcademicYear || ''}
            onChange={event => onChange({
              defaultAcademicYear: event.target.value ? Number(event.target.value) : null,
            })}
          >
            <option value="">No default</option>
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
};

// --- Data --------------------------------------------------------------------

const DataTab = ({ toast }) => {
  const templates = [
    { type: 'students', label: 'Students', blurb: 'Roll number, name, email, batch, section.' },
    { type: 'subjects', label: 'Subjects', blurb: 'Code, name, credits, semester.' },
    { type: 'marks', label: 'Marks', blurb: 'One row per student per subject.' },
    { type: 'attendance', label: 'Attendance', blurb: 'Classes held and classes attended.' },
    { type: 'faculty', label: 'Faculty', blurb: 'Name, email, role, department.' },
  ];

  const download = async (type, label) => {
    try {
      await downloadFile(`/import/${type}/template`, {}, `amis-${type}-template.xlsx`);
    } catch {
      toast.error(null, `Could not download the ${label.toLowerCase()} template.`);
    }
  };

  return (
    <section className="card settings-card">
      <h2>Import templates</h2>
      <p className="text-muted">
        The spreadsheet layouts the importer expects. Filling one of these in is the
        fastest way to get a class into AMIS.
      </p>

      <ul className="settings-list">
        {templates.map(template => (
          <li key={template.type}>
            <div>
              <strong>{template.label}</strong>
              <span className="text-muted">{template.blurb}</span>
            </div>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => download(template.type, template.label)}
            >
              <Download size={16} aria-hidden="true" /> Download
            </button>
          </li>
        ))}
      </ul>

      <p className="text-muted settings-note">
        Looking for everything held about one student? That is on their profile page,
        under <strong>Export data</strong>.
      </p>
    </section>
  );
};

// --- Institution (admin) -----------------------------------------------------

// Mounted only once the institution row has arrived, so the form can be
// initialised from it directly rather than synced across in an effect.
const InstitutionTab = ({ institution, pending, setPending, saving, onSave, toast }) => {
  const [form, setForm] = useState(() => ({
    name: institution.name || '',
    shortName: institution.shortName || '',
    logoUrl: institution.logoUrl || '',
    attendanceCritical: institution.attendanceCritical,
    attendanceWarning: institution.attendanceWarning,
    markConcernPercent: institution.markConcernPercent,
  }));

  const submit = (event) => {
    event.preventDefault();
    onSave({
      name: form.name,
      shortName: form.shortName || null,
      logoUrl: form.logoUrl || null,
      attendanceCritical: Number(form.attendanceCritical),
      attendanceWarning: Number(form.attendanceWarning),
      markConcernPercent: Number(form.markConcernPercent),
    });
  };

  const approve = async (person) => {
    try {
      await api.put(`/auth/users/${person.id}/approve`, { approved: true });
      setPending(current => current.filter(item => item.id !== person.id));
      toast.success(`${person.name} can now sign in.`);
    } catch (error) {
      toast.error(error, 'Could not approve that account.');
    }
  };

  return (
    <>
      <section className="card settings-card">
        <h2>Institution</h2>
        <form onSubmit={submit} className="settings-form">
          <div className="form-group">
            <label htmlFor="institutionName">Name</label>
            <input
              id="institutionName"
              className="input-control"
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              required
              minLength={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="institutionShortName">Short name</label>
            <input
              id="institutionShortName"
              className="input-control"
              value={form.shortName}
              onChange={event => setForm({ ...form, shortName: event.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="institutionLogo">Logo URL</label>
            <input
              id="institutionLogo"
              className="input-control"
              type="url"
              placeholder="https://…"
              value={form.logoUrl}
              onChange={event => setForm({ ...form, logoUrl: event.target.value })}
              aria-describedby="logo-hint"
            />
            <p id="logo-hint" className="text-muted settings-hint">
              Printed at the top of every generated report.
            </p>
          </div>

          <h3>Thresholds</h3>
          <p className="text-muted settings-hint">
            These are what the alert engine applies. Changing them affects alerts raised
            from now on; alerts already raised keep the wording they were given.
          </p>

          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="attendanceCritical">Attendance: serious below</label>
              <input
                id="attendanceCritical"
                className="input-control"
                type="number"
                min={1}
                max={100}
                value={form.attendanceCritical}
                onChange={event => setForm({ ...form, attendanceCritical: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="attendanceWarning">Attendance: warn below</label>
              <input
                id="attendanceWarning"
                className="input-control"
                type="number"
                min={1}
                max={100}
                value={form.attendanceWarning}
                onChange={event => setForm({ ...form, attendanceWarning: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="markConcern">Marks: concern below</label>
              <input
                id="markConcern"
                className="input-control"
                type="number"
                min={1}
                max={100}
                value={form.markConcernPercent}
                onChange={event => setForm({ ...form, markConcernPercent: event.target.value })}
              />
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save institution settings'}
          </button>
        </form>
      </section>

      <section className="card settings-card">
        <h2>Grading scale</h2>
        <p className="text-muted">
          The bands SGPA and CGPA are calculated from. They are set up in the first-run
          wizard, and changing them afterwards recalculates nothing on its own - existing
          SGPA figures keep the scale they were computed with.
        </p>
        <a className="btn btn-outline" href="/setup">Open the setup wizard</a>
      </section>

      <section className="card settings-card">
        <h2>Accounts waiting for approval</h2>
        {pending.length === 0 ? (
          <p className="text-muted">Nobody is waiting.</p>
        ) : (
          <ul className="settings-list">
            {pending.map(person => (
              <li key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <span className="text-muted">{person.email} · {roleLabel(person.role)}</span>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => approve(person)}>
                  <CheckCircle2 size={16} aria-hidden="true" /> Approve
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

// --- About -------------------------------------------------------------------

const AboutTab = ({ version, institution }) => (
  <section className="card settings-card">
    <h2>About AMIS</h2>
    <dl className="settings-facts">
      <div><dt>Version</dt><dd>{version || 'unknown'}</dd></div>
      {institution?.name && <div><dt>Institution</dt><dd>{institution.name}</dd></div>}
      {institution?.setupCompletedAt && (
        <div>
          <dt>Set up</dt>
          <dd>{new Date(institution.setupCompletedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</dd>
        </div>
      )}
    </dl>

    <div className="settings-about-links">
      <a className="btn btn-outline" href="/changelog">What has changed</a>
      <a className="btn btn-outline" href="/privacy">Privacy</a>
    </div>

    <p className="text-muted settings-note">
      Something not working? Use <strong>Report a problem</strong> in the top bar - it
      sends the page you were on and the reference for the request that failed, and
      nothing about any student.
    </p>
  </section>
);

export default SettingsPage;
