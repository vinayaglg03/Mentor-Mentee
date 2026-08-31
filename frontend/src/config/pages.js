import { lazy } from 'react';

// The component behind each route key in config/navigation.js.
//
// Kept apart from App.jsx so a test can check that every declared route has a
// page without rendering the application, and apart from navigation.js so
// that file stays free of anything that pulls in a page.
//
// Every page is loaded on demand: importing all of them up front meant
// somebody sitting on the login screen downloaded the marks grid, the student
// detail page and chart.js before they could type a password.

export const PAGES = {
  Login: lazy(() => import('../pages/Login')),
  LandingPage: lazy(() => import('../pages/LandingPage')),
  MentorDashboard: lazy(() => import('../pages/MentorDashboard')),
  HODDashboard: lazy(() => import('../pages/HODDashboard')),
  StudentDetail: lazy(() => import('../pages/StudentDetail')),
  ImportPage: lazy(() => import('../pages/ImportPage')),
  MarksEntry: lazy(() => import('../pages/MarksEntry')),
  AttendanceEntry: lazy(() => import('../pages/AttendanceEntry')),
  ReportsPage: lazy(() => import('../pages/ReportsPage')),
  BatchesPage: lazy(() => import('../pages/BatchesPage')),
  SettingsPage: lazy(() => import('../pages/SettingsPage')),
  UnsubscribePage: lazy(() => import('../pages/UnsubscribePage')),
  AuthCallback: lazy(() => import('../pages/AuthCallback')),
  SetupWizard: lazy(() => import('../pages/SetupWizard')),
  PrivacyPage: lazy(() => import('../pages/PrivacyPage')),
  ChangelogPage: lazy(() => import('../pages/ChangelogPage')),
  NotFound: lazy(() => import('../pages/NotFound')),
};

export default PAGES;
