import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { homeFor } from '../lib/permissions';
import './NotFound.css';

// What used to happen here was a redirect to the dashboard. That is worse
// than useless: a stale link, a typo and a genuinely broken nav item all
// looked identical to a successful navigation, so nobody reported any of them.
const NotFound = () => {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <main className="not-found">
      <div className="not-found-card card">
        <Compass size={40} className="not-found-icon" aria-hidden="true" />
        <h1>There is nothing at this address</h1>
        <p className="text-muted">
          <code>{location.pathname}</code> is not a page in AMIS. It may be an old
          link, or something that has been renamed.
        </p>

        <div className="not-found-actions">
          <Link className="btn btn-primary" to={user ? homeFor(user) : '/'}>
            <ArrowLeft size={16} aria-hidden="true" />
            {user ? 'Back to your dashboard' : 'Back to the start'}
          </Link>
          {user && (
            <Link className="btn btn-outline" to="/settings">
              Settings
            </Link>
          )}
        </div>

        <p className="text-muted not-found-help">
          If you followed a link inside AMIS to get here, that is a bug worth
          reporting - use <strong>Report a problem</strong> in the top bar.
        </p>
      </div>
    </main>
  );
};

export default NotFound;
