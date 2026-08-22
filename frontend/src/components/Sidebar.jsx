import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { can, atLeast } from '../lib/permissions';
import { LayoutDashboard, Users, Bell, LogOut, Settings, FileText, GraduationCap, Upload, Table2, CalendarCheck, FileDown, Layers, Shield, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // One list, filtered by what this user may actually do. A coordinator gets
  // the department view plus their own mentee tools; a mentor gets neither
  // the registry nor the analytics terminal.
  const navItems = [
    atLeast(user, 'COORDINATOR')
      ? { to: '/hod/dashboard', icon: LayoutDashboard, label: 'Intelligence Terminal' }
      : { to: '/mentor/dashboard', icon: Users, label: 'My Mentees' },
    can(user, 'analytics:read') && { to: '/hod/registry', icon: Users, label: 'Student Registry' },
    can(user, 'analytics:read') && { to: '/hod/mentors', icon: GraduationCap, label: 'Mentor Network' },
    !atLeast(user, 'COORDINATOR') && { to: '/progress-logs', icon: FileText, label: 'Academic Logs' },
    !atLeast(user, 'COORDINATOR') && { to: '/alerts', icon: Bell, label: 'Active Alerts' },
    { to: '/marks/entry', icon: Table2, label: 'Mark Entry' },
    { to: '/attendance/entry', icon: CalendarCheck, label: 'Attendance' },
    { to: '/import', icon: Upload, label: 'Bulk Import' },
    can(user, 'batch:promote') && { to: '/batches', icon: Layers, label: 'Batches' },
    { to: '/reports', icon: FileDown, label: 'Reports' },
    { to: '/settings', icon: Settings, label: atLeast(user, 'HOD') ? 'System Settings' : 'Preferences' },
    { to: '/privacy', icon: Shield, label: 'Privacy' },
    { to: '/changelog', icon: Sparkles, label: 'What changed' },
  ].filter(Boolean);

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
        <button onClick={handleLogout} className="logout-btn" type="button" aria-label="Sign out">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
