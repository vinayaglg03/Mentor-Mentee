import React from 'react';
import { Menu } from 'lucide-react';
import { roleLabel } from '../lib/permissions';
import { useAuth } from '../context/useAuth';
import GlobalSearch from './GlobalSearch';
import ReportProblem from './ReportProblem';
import NotificationBell from './NotificationBell';
import './TopBar.css';

const TopBar = ({ navOpen = false, onToggleNav }) => {
  const { user } = useAuth();

  return (
    <header className="topbar">
      {/* Only rendered as a control below 768px, where the sidebar is a
          drawer. Above that the navigation is always on screen. */}
      <button
        type="button"
        className="nav-toggle"
        onClick={onToggleNav}
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        aria-controls="main-navigation"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

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
