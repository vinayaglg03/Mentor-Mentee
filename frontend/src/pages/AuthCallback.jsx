import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { refreshSession } from '../services/api';
import { homeFor } from '../lib/permissions';
import './Login.css';

// Where Google sends the browser back to. The session cookie is already set
// by the server, so this only has to turn it into an access token.
const AuthCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const failure = params.get('error');

    if (failure) {
      navigate(`/login?error=${encodeURIComponent(failure)}`, { replace: true });
      return;
    }

    let cancelled = false;

    refreshSession()
      .then(data => {
        if (cancelled) return;
        login(data);
        navigate(homeFor(data.user), { replace: true });
      })
      .catch(() => {
        if (!cancelled) setError('That sign-in did not complete. Please try again.');
      });

    return () => { cancelled = true; };
  }, [params, login, navigate]);

  return (
    <div className="auth-view">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h2>{error ? 'Sign-in failed' : 'Signing you in…'}</h2>
            <p>{error || 'One moment.'}</p>
          </div>
          {error && (
            <button className="btn btn-primary btn-full" onClick={() => navigate('/login', { replace: true })}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
