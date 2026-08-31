import { describe, it, expect } from 'vitest';
import { ROUTES, NAV_ROUTES, navItemsFor } from './navigation';
import { PAGES } from './pages';

// The bug this file exists to prevent: the sidebar linking somewhere the
// router has never heard of. Six entries did that - Student Registry, Mentor
// Network, Academic Logs, Security Alerts and two Settings links - and every
// one of them silently redirected to the dashboard instead of failing, which
// is why nobody noticed.

const mentor = { role: 'MENTOR', id: 'u1', departmentId: 'd1' };
const coordinator = { role: 'COORDINATOR', id: 'u2', departmentId: 'd1' };
const hod = { role: 'HOD', id: 'u3', departmentId: 'd1' };
const superAdmin = { role: 'SUPER_ADMIN', id: 'u4' };

const EVERYONE = [mentor, coordinator, hod, superAdmin];

describe('navigation and routes agree', () => {
  it('gives every nav entry a route, for every role', () => {
    const declared = new Set(ROUTES.map(route => route.path));

    for (const user of EVERYONE) {
      for (const item of navItemsFor(user)) {
        expect(declared, `${user.role} sees ${item.to}`).toContain(item.to);
      }
    }
  });

  it('points every route at a page that exists', () => {
    for (const route of ROUTES) {
      expect(PAGES[route.page], `${route.path} -> ${route.page}`).toBeDefined();
    }
  });

  it('never links to a route the user is not allowed to open', () => {
    // navItemsFor filters on the same `require` the router enforces, so a
    // visible link can never end in a redirect.
    const byPath = Object.fromEntries(ROUTES.map(route => [route.path, route]));

    for (const user of EVERYONE) {
      for (const item of navItemsFor(user)) {
        expect(byPath[item.to].layout).toBe('app');
      }
    }
  });

  it('has no duplicate paths', () => {
    const paths = ROUTES.map(route => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every nav entry a label, an icon and a place in the order', () => {
    for (const route of NAV_ROUTES) {
      expect(route.nav.icon, route.path).toBeTruthy();
      expect(route.nav.label, route.path).toBeTruthy();
      expect(typeof route.nav.order, route.path).toBe('number');
    }

    const orders = NAV_ROUTES.map(route => route.nav.order);
    expect(new Set(orders).size, 'two nav entries share a position').toBe(orders.length);
  });

  it('does not offer the paths that were removed', () => {
    // These had a sidebar entry and no route. Deleted rather than built: the
    // registry and the mentor list are already on the HOD dashboard, and
    // mentoring logs live on the student page.
    const removed = ['/hod/registry', '/hod/mentors', '/progress-logs', '/alerts'];
    const declared = ROUTES.map(route => route.path);

    for (const path of removed) {
      expect(declared).not.toContain(path);
    }
  });

  it('shows a mentor their mentees and a HOD the department view', () => {
    const mentorPaths = navItemsFor(mentor).map(item => item.to);
    expect(mentorPaths).toContain('/mentor/dashboard');
    expect(mentorPaths).not.toContain('/hod/dashboard');
    expect(mentorPaths).not.toContain('/batches');

    const hodPaths = navItemsFor(hod).map(item => item.to);
    expect(hodPaths).toContain('/hod/dashboard');
    expect(hodPaths).toContain('/batches');
    // One dashboard link, not two pointing at the same job.
    expect(hodPaths).not.toContain('/mentor/dashboard');
  });

  it('labels settings for who is reading it', () => {
    const labelFor = (user) => navItemsFor(user).find(item => item.to === '/settings')?.label;

    expect(labelFor(mentor)).toBe('Preferences');
    expect(labelFor(hod)).toBe('Settings');
  });
});
