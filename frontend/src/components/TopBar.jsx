import React from 'react';
import { Search, Bell, HelpCircle } from 'lucide-react';
import { roleLabel } from '../lib/permissions';
import { useAuth } from '../context/useAuth';
import GlobalSearch from './GlobalSearch';
import ReportProblem from './ReportProblem';
import './TopBar.css';

const TopBar = () => {
  const { user } = useAuth();

  return (
    <header className="topbar">
      {/* Was a decorative input that did nothing. */}
      <GlobalSearch />
      
      <div className="topbar-actions">
        <ReportProblem />
        <button className="icon-btn" type="button" aria-label="Help">
          <HelpCircle size={20} aria-hidden="true" />
        </button>
        <button className="icon-btn" type="button" aria-label="Notifications">
          <Bell size={20} aria-hidden="true" />
          <span className="dot" aria-hidden="true"></span>
        </button>
        
        <div className="topbar-user">
          <span className="user-name">{user?.name || 'Welcome'}</span>
          <span className="user-role-badge">{roleLabel(user?.role)}</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
