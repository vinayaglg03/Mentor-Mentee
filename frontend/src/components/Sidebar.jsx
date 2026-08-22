import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { navItemsFor, BRAND } from '../config/navigation';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Derived from the routes rather than kept as a second list here, so a nav
  // item that points at nothing is not something you can write. See
  // config/navigation.js.
  const navItems = navItemsFor(user);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon">
          <BRAND.icon size={28} color="var(--chrome-fg)" aria-hidden="true" />
        </div>
        <h2>{BRAND.name}</h2>
      </div>

      <nav className="nav-menu" aria-label="Main">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} aria-hidden="true" />
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
          <div className="user-avatar" aria-hidden="true">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="user-info">
            <span className="name">{user?.name || 'User'}</span>
            <span className="role">{user?.role}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn" type="button">
          <LogOut size={18} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
