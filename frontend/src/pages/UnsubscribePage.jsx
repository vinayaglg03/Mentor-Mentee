import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Login.css';

// Reached from the link at the bottom of a digest, so it must work without a
// session: the token in the URL is the only credential.
const UnsubscribePage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  // A missing token is knowable from the URL alone, so it is initial state
  // rather than an effect.
  const [status, setStatus] = useState(token ? 'idle' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'That link is missing its token. Change the setting from your account instead.'
  );

  const apply = async (digestFrequency) => {
    setStatus('working');
    try {
      const { data } = await api.post('/notifications/unsubscribe', { token, digestFrequency });
      setStatus('done');
      setMessage(data.message);
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'That did not work. Try again from your account settings.');
    }
  };

  return (
    <main className="auth-view">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>AMIS email digest</h1>
            <p>Choose how often you want to hear from AMIS.</p>
          </div>

          {message && (
            <div className={status === 'error' ? 'error-alert' : 'info-alert'}>{message}</div>
          )}

          {status !== 'done' && token && (
            <div className="auth-form">
              <button
                className="btn btn-primary btn-full"
                type="button"
                disabled={status === 'working'}
                onClick={() => apply('OFF')}
              >
                Stop sending me digests
              </button>
              <button
                className="btn btn-outline btn-full mt-2"
                type="button"
                disabled={status === 'working'}
                onClick={() => apply('WEEKLY')}
              >
                Send weekly instead of daily
              </button>
            </div>
          )}

          <button className="btn btn-link btn-full mt-2" onClick={() => navigate('/')}>
            Back to AMIS
          </button>
        </div>
      </div>
    </main>
  );
};

export default UnsubscribePage;
