// Mirrors backend/src/lib/access.js for presentation only. The server is
// still the authority: this decides what to show, never what is allowed.
const RANK = { SUPER_ADMIN: 4, HOD: 3, COORDINATOR: 2, MENTOR: 1 };

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Administrator',
  HOD: 'Head of Department',
  COORDINATOR: 'Class Coordinator',
  MENTOR: 'Mentor',
};

export const roleLabel = (role) => ROLE_LABELS[role] || 'Mentor';

export const atLeast = (user, role) => (RANK[user?.role] ?? 0) >= (RANK[role] ?? 0);

// Same action names the API uses, so the two stay recognisably in step.
export const can = (user, action) => {
  if (!user) return false;

  switch (action) {
    case 'student:read':
    case 'student:create':
    case 'marks:write':
    case 'attendance:write':
    case 'import:run':
    case 'reports:read':
      return atLeast(user, 'MENTOR');

    case 'student:assign':
    case 'analytics:read':
      return atLeast(user, 'COORDINATOR');

    case 'student:delete':
    case 'subject:write':
    case 'user:manage':
    case 'audit:read':
    case 'batch:promote':
      return atLeast(user, 'HOD');

    case 'user:role':
    case 'department:manage':
      return user.role === 'SUPER_ADMIN';

    default:
      return false;
  }
};

// Where a user lands after signing in.
export const homeFor = (user) =>
  atLeast(user, 'COORDINATOR') ? '/hod/dashboard' : '/mentor/dashboard';
