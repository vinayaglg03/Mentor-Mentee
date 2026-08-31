import React, { useCallback, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { atLeast } from '../lib/permissions';
import DemoBanner from './DemoBanner';
import ConnectionBanner from './ConnectionBanner';

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const { reduceMotion } = useTheme();

  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // A HOD or coordinator with nothing assigned to them sees empty screens.
  // Say why rather than letting it look broken.
  const unscoped = atLeast(user, 'COORDINATOR') && user?.role !== 'SUPER_ADMIN' && !user?.departmentId;

  // Opacity only, and short. `mode="wait"` used to hold the incoming page
  // back until the outgoing one had finished leaving: 300ms out plus 300ms
  // in, before any data was even requested.
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' };

  return (
    <div className="app-container">
      {/* First stop for a keyboard user: skip the whole navigation. */}
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="main-wrapper">
        <TopBar navOpen={navOpen} onToggleNav={() => setNavOpen(open => !open)} />
        <main className="main-content" id="main-content" tabIndex={-1}>
          <ConnectionBanner />
          <DemoBanner />
          {unscoped && (
            <div className="scope-warning" role="status">
              Your account is not attached to a department yet, so there is nothing to show.
              Ask an administrator to assign you one.
            </div>
          )}
          <AnimatePresence>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
