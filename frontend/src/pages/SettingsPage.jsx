import React, { useEffect, useState } from 'react';
import { Bell, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { roleLabel } from '../lib/permissions';
import './ImportPage.css';
import './MarksEntry.css';

const OPTIONS = [
  { value: 'DAILY', label: 'Daily', blurb: 'One email each morning with your alerts, follow-ups due and mentees nobody has spoken to.' },
  { value: 'WEEKLY', label: 'Weekly', blurb: 'The same digest, once a week instead.' },
  { value: 'OFF', label: 'Off', blurb: 'No email. Alerts still appear on your dashboard.' },
];

const SettingsPage = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences')
      .then(({ data }) => setPreferences(data))
      .catch(() => setError('Could not load your notification settings.'));
  }, []);

  const choose = async (digestFrequency) => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      await api.put('/notifications/preferences', { digestFrequency });
      setPreferences(current => ({ ...current, digestFrequency }));
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted">
            Signed in as {user?.name} · {roleLabel(user?.role)}
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

      {saved && (
        <div className="import-banner import-banner-success" role="status">
          <CheckCircle2 size={18} />
          <span>Saved.</span>
          <button className="btn-icon" onClick={() => setSaved(false)} title="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}><Bell size={18} /> Email digest</h3>

        {!preferences ? (
          <p className="text-muted" style={{ fontSize: '14px' }}>Loading…</p>
        ) : (
          <>
            <div className="import-types" style={{ marginTop: '1rem' }}>
              {OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  className={`import-type ${preferences.digestFrequency === option.value ? 'is-active' : ''}`}
                  onClick={() => choose(option.value)}
                >
                  <Bell size={18} />
                  <span className="import-type-label">{option.label}</span>
                  <span className="import-type-blurb">{option.blurb}</span>
                </button>
              ))}
            </div>

            <p className="text-muted" style={{ fontSize: '13px', marginTop: '1.25rem' }}>
              A mentee with no logged interaction for {preferences.inactivityDays} days is flagged in your digest.
              A high-severity alert still open after {preferences.escalateAfterDays} days is escalated to your HOD.
              {preferences.lastDigestAt && (
                <> Last sent {new Date(preferences.lastDigestAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
