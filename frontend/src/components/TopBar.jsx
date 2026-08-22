import React from 'react';
import { roleLabel } from '../lib/permissions';
import { useAuth } from '../context/useAuth';
import GlobalSearch from './GlobalSearch';
import ReportProblem from './ReportProblem';
import NotificationBell from './NotificationBell';
import './TopBar.css';

const TopBar = () => {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <GlobalSearch />

      <div className="topbar-actions">
        <ReportProblem />
        {/* The help button that used to sit here had no onClick and never
            had one. Report a problem is the control that actually does
            something when somebody is stuck. */}
        <NotificationBell />

        <div className="topbar-user">
          <span className="user-name">{user?.name || 'Welcome'}</span>
          <span className="user-role-badge">{roleLabel(user?.role)}</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
