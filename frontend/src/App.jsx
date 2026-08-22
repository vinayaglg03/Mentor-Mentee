import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/Toaster';
import { useAuth } from './context/useAuth';
import { can, homeFor } from './lib/permissions';
import { SkeletonCards } from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { ROUTES } from './config/navigation';
import { PAGES } from './config/pages';

// Layout: on screen for every signed-in route, so it is not worth splitting.
import DashboardLayout from './components/DashboardLayout';

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
  const NotFound = PAGES.NotFound;
  const LandingPage = PAGES.LandingPage;

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* The front door: the landing page for a visitor, their own
              dashboard for anybody already signed in. */}
          <Route path="/" element={
            user ? <Navigate to={homeFor(user)} replace /> : <LandingPage />
          } />

          {/* Everything else comes from config/navigation.js, which is the
              same list the sidebar is built from. */}
          {ROUTES.map(({ path, page, require: required, layout }) => {
            const Page = PAGES[page];

            if (layout === 'public') {
              // /login is the one public route that should not be shown to
              // somebody who is already signed in.
              const element = path === '/login' && user
                ? <Navigate to={homeFor(user)} replace />
                : <Page />;

              return <Route key={path} path={path} element={element} />;
            }

            return (
              <Route
                key={path}
                path={path}
                element={<ProtectedRoute require={required}><Page /></ProtectedRoute>}
              />
            );
          })}

          {/* Was a silent redirect to the dashboard, which is precisely why
              six dead nav links went unnoticed for so long: a mistyped or
              stale URL looked exactly like a working one. */}
          <Route path="*" element={<NotFound />} />
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
