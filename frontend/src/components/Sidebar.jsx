import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LayoutDashboard, Users, Bell, LogOut, Settings, FileText, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = user?.role === 'ADMIN' ? [
    { to: '/hod/dashboard', icon: LayoutDashboard, label: 'Intelligence Terminal' },
    { to: '/hod/registry', icon: Users, label: 'Student Registry' },
    { to: '/hod/mentors', icon: GraduationCap, label: 'Mentor Network' },
    { to: '/settings', icon: Settings, label: 'System Settings' },
  ] : [
    { to: '/mentor/dashboard', icon: Users, label: 'My Mentees' },
    { to: '/progress-logs', icon: FileText, label: 'Academic Logs' },
    { to: '/alerts', icon: Bell, label: 'Security Alerts' },
    { to: '/settings', icon: Settings, label: 'Preferences' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon">
          <GraduationCap size={28} color="white" />
        </div>
        <h2>AMIS</h2>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <NavLink 
            key={item.to}
            to={item.to} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="active-indicator"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="profile-card">
          <div className="user-avatar">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="user-info">
            <span className="name">{user?.name || 'User'}</span>
            <span className="role">{user?.role}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
