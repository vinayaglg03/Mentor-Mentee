import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LogOut, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { navItemsFor, BRAND } from '../config/navigation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import './Sidebar.css';

// Three shapes, one component:
//   wide      - the full 260px column
//   rail      - icons only, from 1024px down, with the label as a tooltip
//   drawer    - below 768px it is off-canvas and slides in over the content
//
// The drawer is the one that needed building. Stacking a 260px sidebar above
// the page on a phone meant scrolling past nine nav items to reach anything.

const Sidebar = ({ open = false, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const panel = useRef(null);
  const previouslyFocused = useRef(null);

  // The drawer only exists below this width; above it the sidebar is always
  // on screen and none of the trapping applies.
  const isDrawer = useMediaQuery('(max-width: 767px)');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Derived from the routes rather than kept as a second list here, so a nav
  // item that points at nothing is not something you can write. See
  // config/navigation.js.
  const navItems = navItemsFor(user);

  // While the drawer is open it is the only thing on screen, so it is also
  // the only thing the keyboard should reach.
  useEffect(() => {
    if (!open || !isDrawer) return undefined;

    previouslyFocused.current = document.activeElement;
    const node = panel.current;

    // A tick later: the panel has only just stopped being inert, and nothing
    // inside an inert subtree can take focus.
    const frame = setTimeout(() => {
      node?.querySelector('a[href], button')?.focus();
    }, 0);

    const focusable = () => [...(node?.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || [])];

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [open, isDrawer, onClose]);

  return (
    <>
      {/* Only rendered while open, so it cannot swallow clicks on a desktop. */}
      {open && (
        <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`sidebar ${open ? 'is-open' : ''}`}
        ref={panel}
        id="main-navigation"
        // A closed drawer is still in the document. inert takes it out of the
        // tab order and out of the accessibility tree in one attribute -
        // hiding it with visibility relied on inheritance that had not been
        // recalculated by the time focus moved.
        inert={isDrawer && !open ? true : undefined}
      >
        <div className="sidebar-header">
          <div className="logo-icon">
            <BRAND.icon size={28} color="var(--chrome-fg)" aria-hidden="true" />
          </div>
          <h2>
            {BRAND.name}
            <span className="wordmark-devanagari" lang="hi" aria-hidden="true">{BRAND.devanagari}</span>
          </h2>

          {/* Only reachable inside the drawer; the rail and column have no
              close button because they are never covering anything. */}
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="nav-menu" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              // Following a link should leave you on the page you asked for,
              // not looking at the navigation you used to get there.
              onClick={onClose}
              // Shown as a tooltip when the sidebar is collapsed to a rail and
              // the label is not rendered.
              title={item.label}
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
          <button onClick={handleLogout} className="logout-btn" type="button" title="Sign out">
            <LogOut size={18} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
