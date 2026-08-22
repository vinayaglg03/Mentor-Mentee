import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { atLeast } from '../lib/permissions';
import DemoBanner from './DemoBanner';
import ConnectionBanner from './ConnectionBanner';

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();

  // A HOD or coordinator with nothing assigned to them sees empty screens.
  // Say why rather than letting it look broken.
  const unscoped = atLeast(user, 'COORDINATOR') && user?.role !== 'SUPER_ADMIN' && !user?.departmentId;

  return (
    <div className="app-container">
      {/* First stop for a keyboard user: skip the whole navigation. */}
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Sidebar />
      <div className="main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <main className="main-content" id="main-content" tabIndex={-1}>
          <ConnectionBanner />
          <DemoBanner />
          {unscoped && (
            <div className="scope-warning" role="status">
              Your account is not attached to a department yet, so there is nothing to show.
              Ask an administrator to assign you one.
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
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
