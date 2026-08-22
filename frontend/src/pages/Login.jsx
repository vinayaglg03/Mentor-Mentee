import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api, { apiRoot } from '../services/api';
import { homeFor } from '../lib/permissions';
import './Login.css';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { login } = useAuth();

  const [options, setOptions] = useState({ googleEnabled: false, passwordEnabled: true, allowedDomains: [] });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState(() => {
    const reason = params.get('error');
    if (!reason) return '';
    return reason === 'pending-approval' ? '' : reason;
  });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const pendingApproval = params.get('error') === 'pending-approval';

  useEffect(() => {
    if (location.state?.signup) setIsLogin(false);
  }, [location.state]);

  useEffect(() => {
    api.get('/auth/config')
      .then(({ data }) => {
        setOptions(data);
        // With Google available, the password form is a fallback rather than
        // the first thing a mentor sees.
        setShowPasswordForm(!data.googleEnabled);
      })
      .catch(() => setShowPasswordForm(true));
  }, []);

  const continueWithGoogle = () => {
    window.location.href = `${apiRoot}/auth/google`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (isLogin) {
        const { data } = await api.post('/auth/login', { email, password });
        login(data);
        navigate(homeFor(data.user));
      } else {
        await api.post('/auth/register', { name, email, password });
        setIsLogin(true);
        setPassword('');
        setNotice('Registration received. Your account is awaiting approval by your HOD.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (pendingApproval) {
    return (
      <main className="auth-view">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <h1>Almost there</h1>
              <p>Your account has been created.</p>
            </div>

            <div className="info-alert">
              Your HOD needs to assign your role before you can use AMIS. You will be able to sign in
              as soon as they do — no need to register again.
            </div>

            <button className="btn btn-outline btn-full" onClick={() => navigate('/login', { replace: true })}>
              Back to sign in
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-view">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
            <p>
              {options.googleEnabled
                ? 'Sign in with your college account'
                : isLogin ? 'Sign in to your AMIS account' : 'Join the AMIS platform'}
            </p>
          </div>

          {error && <div className="error-alert" role="alert">{error}</div>}
          {notice && <div className="info-alert" role="status">{notice}</div>}

          {options.googleEnabled && (
            <>
              <button type="button" className="btn btn-google btn-full" onClick={continueWithGoogle}>
                <GoogleMark /> Continue with Google
              </button>

              {options.allowedDomains.length > 0 && (
                <p className="auth-hint">
                  Only {options.allowedDomains.map(domain => `@${domain}`).join(' and ')} accounts can sign in.
                </p>
              )}
            </>
          )}

          {options.googleEnabled && options.passwordEnabled && !showPasswordForm && (
            <button type="button" className="btn btn-link btn-full mt-2" onClick={() => setShowPasswordForm(true)}>
              Use a password instead
            </button>
          )}

          {showPasswordForm && (
            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <div className="form-group">
                  <label htmlFor="login-name">Full Name</label>
                  <input
                    id="login-name"
                    type="text"
                    className="input-control"
                    placeholder="Dr. John Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="login-email">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  className="input-control"
                  placeholder="name@institution.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  className="input-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
              </button>
            </form>
          )}

          {showPasswordForm && options.passwordEnabled && (
            <p className="auth-switch">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Sign up' : 'Login'}</span>
            </p>
          )}

          <button className="btn btn-link btn-full mt-2" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </main>
  );
};

export default Login;
