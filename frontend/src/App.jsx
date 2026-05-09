import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Login from './pages/Login';
import MentorDashboard from './pages/MentorDashboard';
import HODDashboard from './pages/HODDashboard';
import StudentDetail from './pages/StudentDetail';

import LandingPage from './pages/LandingPage';

// Layout
import DashboardLayout from './components/DashboardLayout';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />; // or default dashboard
  }
  
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
            user.role === 'ADMIN' ? <Navigate to="/hod/dashboard" replace /> : <Navigate to="/mentor/dashboard" replace />
          ) : <LandingPage />
        } />
        
        <Route path="/login" element={
          user ? (
            user.role === 'ADMIN' ? <Navigate to="/hod/dashboard" replace /> : <Navigate to="/mentor/dashboard" replace />
          ) : <Login />
        } />
        
        {/* Mentor Routes */}
        <Route path="/mentor/dashboard" element={
          <ProtectedRoute allowedRoles={['MENTOR']}>
            <MentorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/student/:id" element={
          <ProtectedRoute allowedRoles={['MENTOR', 'ADMIN']}>
            <StudentDetail />
          </ProtectedRoute>
        } />
        
        {/* Admin/HOD Routes */}
        <Route path="/hod/dashboard" element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <HODDashboard />
          </ProtectedRoute>
        } />

        <Route path="*" element={
          user ? (
            user.role === 'ADMIN' ? <Navigate to="/hod/dashboard" replace /> : <Navigate to="/mentor/dashboard" replace />
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
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
