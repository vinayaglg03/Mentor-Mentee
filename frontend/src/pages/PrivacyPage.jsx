import React, { useEffect, useState } from 'react';
import { Shield, Download, FileText } from 'lucide-react';
import api from '../services/api';
import './ImportPage.css';
import './MarksEntry.css';

// The in-app answer to "where is our student data and who can see it?".
// The numbers come from the running configuration, so this page cannot drift
// from what the deployment actually does.
const PrivacyPage = () => {
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/privacy/retention')
      .then(({ data }) => setPolicy(data))
      .catch(() => setError('Could not load the retention settings for this deployment.'));
  }, []);

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1><Shield size={22} aria-hidden="true" /> Privacy</h1>
          <p className="text-muted">
            What AMIS stores about students, who can see it, and how long it is kept.
          </p>
        </div>
      </header>

      {error && <div className="import-banner import-banner-error" role="alert">{error}</div>}

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2>What is stored</h2>
        <p>
          Identity (name, roll number, email, department, batch, section), marks, attendance,
          calculated SGPA and CGPA, alerts, achievements, and the mentoring log your mentor
          keeps — including what was discussed and what was agreed.
        </p>
        <p>
          Also kept automatically: a record of every change to a mark or attendance figure, with
          who made it and when; and the sessions you are signed in with.
        </p>
        <p>Not collected: caste, religion, biometric data, financial data, or location.</p>

        <h2>Who can see it</h2>
        <ul>
          <li><strong>Your mentor</strong> — only their own mentees.</li>
          <li><strong>Your class coordinator</strong> — only students in their section.</li>
          <li><strong>Your head of department</strong> — only their own department.</li>
          <li><strong>The system administrator</strong> — everything.</li>
        </ul>
        <p>
          Two departments using the same instance cannot see each other&apos;s students. Mentoring
          remarks are not visible to other mentors.
        </p>

        <h2>How long it is kept</h2>
        {policy ? (
          <table className="data-table table-cards">
            <thead>
              <tr><th>What</th><th>Kept for</th></tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="What">Record of changes (audit log)</td>
                <td data-label="Kept for">{policy.auditYears} years</td>
              </tr>
              <tr>
                <td data-label="What">Records of students who have left</td>
                <td data-label="Kept for">
                  Reviewed after {policy.graduatedStudentYears} years; never deleted automatically
                </td>
              </tr>
              <tr>
                <td data-label="What">Signed-in sessions</td>
                <td data-label="Kept for">{policy.refreshTokenDays} days</td>
              </tr>
              <tr>
                <td data-label="What">Uploaded spreadsheets awaiting confirmation</td>
                <td data-label="Kept for">{policy.pendingImportMinutes} minutes</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-muted">Loading the settings for this deployment…</p>
        )}

        <h2>Your rights</h2>
        <p>
          You can ask for a copy of everything held about you, ask for a correction, or ask for it
          to be deleted. Any of your mentors can produce the full export from your profile page
          with <strong>Export data</strong>; deletion is done by a head of department and is
          permanent.
        </p>
        <p>
          Marks and attendance are corrected in place, and every correction is recorded. A
          mentoring log can be edited by its author for 24 hours; after that a correction is added
          as a new entry and the original is kept, because a pastoral record that can be quietly
          rewritten is not evidence of anything.
        </p>

        <h2>Who to ask</h2>
        <p>
          {policy?.contact
            ? <>Write to <a href={`mailto:${policy.contact}`}>{policy.contact}</a>.</>
            : 'Ask your head of department; this deployment has not published a privacy contact address.'}
          {policy?.dataController && <> The data is held by {policy.dataController}.</>}
        </p>

        <p className="text-muted" style={{ fontSize: '13px', marginTop: '1.5rem' }}>
          <FileText size={14} aria-hidden="true" /> The full policy, including lawful basis and the
          points a lawyer should review, is in <code>docs/PRIVACY.md</code> in the repository.
          <Download size={14} aria-hidden="true" style={{ marginLeft: '0.75rem' }} /> Security
          measures are summarised in <code>docs/SECURITY.md</code>.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPage;
