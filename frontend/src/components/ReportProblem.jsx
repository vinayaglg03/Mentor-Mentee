import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy, X } from 'lucide-react';
import api from '../services/api';
import { useToast } from './useToast';
import './ReportProblem.css';

// Faculty who hit a bug with nowhere to report it stop using the tool and
// never tell you why. This captures what a developer needs without asking a
// non-technical user to find any of it.
const ReportProblem = () => {
  const location = useLocation();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);

    try {
      const { data } = await api.post('/privacy/report-problem', {
        message,
        route: `${location.pathname}${location.search}`,
        // The last request id the app saw, if a failure put one there.
        requestId: window.__amisLastRequestId,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
      });

      setSent(data);
      setMessage('');
    } catch (error) {
      toast.error(error, 'Could not send that report.');
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    setOpen(false);
    setSent(null);
  };

  return (
    <>
      <button
        type="button"
        className="report-problem-trigger"
        onClick={() => setOpen(true)}
        aria-label="Report a problem"
        title="Report a problem"
      >
        <LifeBuoy size={18} aria-hidden="true" />
        <span>Report a problem</span>
      </button>

      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="report-problem-title">
          <div className="modal-content card report-problem-card">
            <div className="flex-between border-bottom pb-2" style={{ padding: '1rem 1.5rem' }}>
              <h3 id="report-problem-title">Report a problem</h3>
              <button className="btn-icon" onClick={close} aria-label="Close"><X size={18} /></button>
            </div>

            <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
              {sent ? (
                <>
                  <p>{sent.message}</p>
                  <p className="text-muted" style={{ fontSize: '13px' }}>
                    Reference <code>{sent.requestId}</code>
                    {!sent.emailed && ' — your administrator can find it in the server log.'}
                  </p>
                  <button className="btn btn-primary btn-full" type="button" onClick={close}>Close</button>
                </>
              ) : (
                <form onSubmit={submit}>
                  <div className="form-group">
                    <label htmlFor="report-message">What happened?</label>
                    <textarea
                      id="report-message"
                      className="input-control"
                      rows={5}
                      required
                      minLength={5}
                      placeholder="I tried to save marks for semester 3 and the page did nothing."
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </div>

                  <p className="text-muted" style={{ fontSize: '12.5px' }}>
                    Sent with this: the page you are on, your browser and screen size, and the
                    reference of the last failed request. No student data is included.
                  </p>

                  <button className="btn btn-primary btn-full" type="submit" disabled={sending}>
                    {sending ? 'Sending…' : 'Send report'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReportProblem;
