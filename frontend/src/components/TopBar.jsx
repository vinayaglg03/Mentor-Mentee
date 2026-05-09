import React from 'react';
import { Search, Bell, HelpCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './TopBar.css';

const TopBar = () => {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-search">
        <Search size={18} className="text-muted" />
        <input type="text" placeholder="Search for students, subjects or analytics..." />
      </div>
      
      <div className="topbar-actions">
        <button className="icon-btn">
          <HelpCircle size={20} />
        </button>
        <button className="icon-btn">
          <Bell size={20} />
          <span className="dot"></span>
        </button>
        
        <div className="topbar-user">
          <span className="user-name">{user?.name || 'Welcome'}</span>
          <span className="user-role-badge">{user?.role === 'ADMIN' ? 'HOD' : 'Mentor'}</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
