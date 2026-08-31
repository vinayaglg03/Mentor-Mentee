import {
  LayoutDashboard, Users, Settings, GraduationCap, Upload, Table2,
  CalendarCheck, FileDown, Layers, Shield, Sparkles,
} from 'lucide-react';
import { can, atLeast } from '../lib/permissions';

// Every route in the app, declared once.
//
// The sidebar used to keep its own list. Six of its entries pointed at paths
// that had no route - Student Registry, Mentor Network, Academic Logs,
// Security Alerts and two Settings links - so they fell through to the `*`
// catch-all, which redirected to the dashboard. Clicking a nav item and
// silently landing back where you started reads as the app being broken, and
// it went unnoticed for exactly that reason: nothing errored.
//
// Now the nav is derived from the routes. A nav entry that points nowhere is
// not a bug you can write: `nav` hangs off the route itself.
//
//   path     the URL
//   page     key into the lazy component map in config/pages.js
//   require  permission checked by ProtectedRoute; null means public
//   layout   'app' wraps it in the sidebar + topbar shell, 'public' does not
//   nav      present if it appears in the sidebar
//     label  what it is called, or a function of the user
//     icon   lucide icon
//     show   optional predicate; defaults to "if you can open it, you see it"
//     order  position in the sidebar

export const ROUTES = [
  {
    path: '/hod/dashboard',
    page: 'HODDashboard',
    require: 'analytics:read',
    layout: 'app',
    nav: { label: 'Dashboard', icon: LayoutDashboard, order: 10 },
  },
  {
    path: '/mentor/dashboard',
    page: 'MentorDashboard',
    require: 'student:read',
    layout: 'app',
    // A HOD gets the department dashboard above instead; showing both is
    // just two links to the same job.
    nav: {
      label: 'My mentees',
      icon: Users,
      order: 11,
      show: (user) => !atLeast(user, 'COORDINATOR'),
    },
  },
  {
    path: '/marks/entry',
    page: 'MarksEntry',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'Mark entry', icon: Table2, order: 20 },
  },
  {
    path: '/attendance/entry',
    page: 'AttendanceEntry',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'Attendance', icon: CalendarCheck, order: 21 },
  },
  {
    path: '/import',
    page: 'ImportPage',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'Bulk import', icon: Upload, order: 22 },
  },
  {
    path: '/batches',
    page: 'BatchesPage',
    require: 'batch:promote',
    layout: 'app',
    nav: { label: 'Batches', icon: Layers, order: 23 },
  },
  {
    path: '/reports',
    page: 'ReportsPage',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'Reports', icon: FileDown, order: 24 },
  },
  {
    path: '/settings',
    page: 'SettingsPage',
    require: 'student:read',
    layout: 'app',
    nav: {
      label: (user) => (atLeast(user, 'HOD') ? 'Settings' : 'Preferences'),
      icon: Settings,
      order: 30,
    },
  },
  {
    path: '/privacy',
    page: 'PrivacyPage',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'Privacy', icon: Shield, order: 31 },
  },
  {
    path: '/changelog',
    page: 'ChangelogPage',
    require: 'student:read',
    layout: 'app',
    nav: { label: 'What changed', icon: Sparkles, order: 32 },
  },

  // Reachable, but not worth a permanent place in the sidebar.
  { path: '/student/:id', page: 'StudentDetail', require: 'student:read', layout: 'app' },
  { path: '/setup', page: 'SetupWizard', require: 'department:manage', layout: 'app' },

  // Public: no session, no shell.
  { path: '/login', page: 'Login', require: null, layout: 'public' },
  { path: '/auth/callback', page: 'AuthCallback', require: null, layout: 'public' },
  { path: '/notifications/unsubscribe', page: 'UnsubscribePage', require: null, layout: 'public' },
];

export const NAV_ROUTES = ROUTES.filter(route => route.nav);

// What this user should see, in order. A route they cannot open is not shown,
// which is why `require` and the sidebar cannot disagree.
export const navItemsFor = (user) => NAV_ROUTES
  .filter(route => !route.require || can(user, route.require))
  .filter(route => !route.nav.show || route.nav.show(user))
  .sort((a, b) => a.nav.order - b.nav.order)
  .map(route => ({
    to: route.path,
    icon: route.nav.icon,
    label: typeof route.nav.label === 'function' ? route.nav.label(user) : route.nav.label,
  }));

// Used by the icon-only rail and the drawer heading.
export const BRAND = { name: 'AMIS', devanagari: 'अमीस', icon: GraduationCap };
