import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from './components/Toaster';
import { useAuth } from './context/useAuth';
import { can, homeFor } from './lib/permissions';

// Pages
import Login from './pages/Login';
import MentorDashboard from './pages/MentorDashboard';
import HODDashboard from './pages/HODDashboard';
import StudentDetail from './pages/StudentDetail';
import ImportPage from './pages/ImportPage';
import MarksEntry from './pages/MarksEntry';
import AttendanceEntry from './pages/AttendanceEntry';
import ReportsPage from './pages/ReportsPage';
import BatchesPage from './pages/BatchesPage';
import SettingsPage from './pages/SettingsPage';
import UnsubscribePage from './pages/UnsubscribePage';
import AuthCallback from './pages/AuthCallback';
import SetupWizard from './pages/SetupWizard';

import LandingPage from './pages/LandingPage';

// Layout
import DashboardLayout from './components/DashboardLayout';

// Guarded by what the user may do rather than by which roles happen to be
// allowed today; the rules live in lib/permissions.js.
const ProtectedRoute = ({ children, require: required }) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (required && !can(user, required)) return <Navigate to={homeFor(user)} replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
};

import ErrorBoundary from './components/ErrorBoundary';

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={
          user ? (
            <Navigate to={homeFor(user)} replace />
          ) : <LandingPage />
        } />
        
        <Route path="/login" element={
          user ? (
            <Navigate to={homeFor(user)} replace />
          ) : <Login />
        } />
        
        {/* Mentor Routes */}
        <Route path="/mentor/dashboard" element={
          <ProtectedRoute require="student:read">
            <MentorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/student/:id" element={
          <ProtectedRoute require="student:read">
            <StudentDetail />
          </ProtectedRoute>
        } />
        
        <Route path="/marks/entry" element={
          <ProtectedRoute require="student:read">
            <MarksEntry />
          </ProtectedRoute>
        } />

        <Route path="/attendance/entry" element={
          <ProtectedRoute require="student:read">
            <AttendanceEntry />
          </ProtectedRoute>
        } />

        {/* Where Google returns the browser after sign-in. */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Reached from an email link, so it must not require a session. */}
        <Route path="/notifications/unsubscribe" element={<UnsubscribePage />} />

        <Route path="/settings" element={
          <ProtectedRoute require="student:read">
            <SettingsPage />
          </ProtectedRoute>
        } />

        <Route path="/setup" element={
          <ProtectedRoute require="department:manage">
            <SetupWizard />
          </ProtectedRoute>
        } />

        <Route path="/batches" element={
          <ProtectedRoute require="batch:promote">
            <BatchesPage />
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute require="student:read">
            <ReportsPage />
          </ProtectedRoute>
        } />

        <Route path="/import" element={
          <ProtectedRoute require="student:read">
            <ImportPage />
          </ProtectedRoute>
        } />

        {/* Admin/HOD Routes */}
        <Route path="/hod/dashboard" element={
          <ProtectedRoute require="analytics:read">
            <HODDashboard />
          </ProtectedRoute>
        } />

        <Route path="*" element={
          user ? (
            <Navigate to={homeFor(user)} replace />
          ) : <Navigate to="/" replace />
        } />
      </Routes>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster>
          <AppRoutes />
        </Toaster>
      </Router>
    </AuthProvider>
  );
}

export default App;
