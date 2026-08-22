import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/Toaster';
import { useAuth } from './context/useAuth';
import { can, homeFor } from './lib/permissions';
import { SkeletonCards } from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';

// Layout: on screen for every signed-in route, so it is not worth splitting.
import DashboardLayout from './components/DashboardLayout';

// Every page is loaded on demand. Statically importing all of them meant
// somebody sitting on the login screen downloaded the marks grid, the student
// detail page, chart.js and the rest before they could type a password.
const Login = lazy(() => import('./pages/Login'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const MentorDashboard = lazy(() => import('./pages/MentorDashboard'));
const HODDashboard = lazy(() => import('./pages/HODDashboard'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const MarksEntry = lazy(() => import('./pages/MarksEntry'));
const AttendanceEntry = lazy(() => import('./pages/AttendanceEntry'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const BatchesPage = lazy(() => import('./pages/BatchesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'));

// Shown while a route chunk is in flight. Shaped like a page rather than a
// spinner, so the layout does not jump when the real thing arrives.
const RouteFallback = () => (
  <div style={{ padding: '1rem 0' }}>
    <SkeletonCards count={3} label="Loading page" />
  </div>
);

// Guarded by what the user may do rather than by which roles happen to be
// allowed today; the rules live in lib/permissions.js.
const ProtectedRoute = ({ children, require: required }) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (required && !can(user, required)) return <Navigate to={homeFor(user)} replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
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

          <Route path="/privacy" element={
            <ProtectedRoute require="student:read">
              <PrivacyPage />
            </ProtectedRoute>
          } />

          <Route path="/changelog" element={
            <ProtectedRoute require="student:read">
              <ChangelogPage />
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
      </Suspense>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <Toaster>
            <AppRoutes />
          </Toaster>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
