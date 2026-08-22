import bcrypt from 'bcryptjs';
import prisma from '../prismaClient.js';
import config from '../config.js';
import { assertCan, ForbiddenError } from '../lib/access.js';
import {
  startSession, rotateRefreshToken, revokeToken, revokeAllForUser,
  refreshCookieFrom, setRefreshCookie, clearRefreshCookie,
} from '../lib/sessions.js';

// Password login is switched off once Google sign-in is working, except for
// a SUPER_ADMIN: somebody has to be able to get in when Google is the thing
// that is broken.
const allowPasswordLogin = (user) =>
  config.auth.passwordLoginEnabled || user.role === 'SUPER_ADMIN';

// Public self-registration, only when password login is on. With Google
// sign-in there is nothing to register: the first sign-in creates the
// account and a HOD approves it.
// Always creates an unapproved MENTOR:
// the role is never taken from the request body, and an HOD must approve
// the account before it can log in.
export const register = async (req, res, next) => {
  try {
    if (!config.auth.passwordLoginEnabled) {
      return res.status(403).json({
        error: 'Registration is handled by your college Google account. Use "Continue with Google".',
      });
    }

    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'MENTOR',
        approved: false,
      },
    });

    res.status(201).json({
      message: 'Registration received. Your account is awaiting approval by your HOD.',
      user: { id: user.id, email: user.email, role: user.role, approved: user.approved }
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN-only user creation. This is how HODs and other mentors get accounts.
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, departmentId } = req.body;

    // Only a SUPER_ADMIN may mint another SUPER_ADMIN or a HOD; a HOD may
    // create coordinators and mentors inside their own department.
    if (role === 'SUPER_ADMIN' || role === 'HOD') {
      await assertCan(req.user, 'user:role', null, 'Only a super admin can create that role.');
    }
    await assertCan(req.user, 'user:manage', departmentId ? { departmentId } : null);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        departmentId: departmentId ?? null,
        approved: true,
      },
    });

    res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, approved: user.approved }
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { approved: false },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// A HOD only administers accounts already attached to their department.
const assertCanAdminister = async (actor, userId) => {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, departmentId: true, role: true },
  });

  if (!target) throw new ForbiddenError('That user does not exist.');
  await assertCan(actor, 'user:manage', target);
  return target;
};

export const setUserDepartment = async (req, res, next) => {
  try {
    await assertCan(req.user, 'user:role', null, 'Only a super admin can move a user between departments.');

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { departmentId: req.body.departmentId },
      select: { id: true, name: true, email: true, role: true, departmentId: true },
    });

    res.json({ message: 'Department updated', user });
  } catch (error) {
    next(error);
  }
};

export const setUserRole = async (req, res, next) => {
  try {
    await assertCan(req.user, 'user:role', null, 'Only a super admin can change a role.');

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: req.body.role },
      select: { id: true, name: true, email: true, role: true, departmentId: true },
    });

    res.json({ message: 'Role updated', user });
  } catch (error) {
    next(error);
  }
};

export const approveUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, departmentId, sectionId } = req.body ?? {};

    await assertCanAdminister(req.user, id);

    // Approving somebody is also where they get their place in the college:
    // a role, a department, and a section if they are a coordinator.
    if (role === 'SUPER_ADMIN' || role === 'HOD') {
      await assertCan(req.user, 'user:role', null, 'Only a super admin can grant that role.');
    }

    if (departmentId) {
      await assertCan(req.user, 'user:manage', { departmentId },
        'You can only place people in your own department.');
    }

    if (sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true, batch: { select: { departmentId: true } } },
      });

      if (!section) throw new ForbiddenError('That section does not exist.');

      await assertCan(req.user, 'user:manage', { departmentId: section.batch.departmentId },
        'You can only assign sections in your own department.');

      await prisma.section.update({ where: { id: sectionId }, data: { coordinatorId: id } });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        approved: true,
        ...(role ? { role } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      select: { id: true, name: true, email: true, role: true, approved: true, departmentId: true }
    });
    res.json({ message: 'User approved successfully', user });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!allowPasswordLogin(user)) {
      return res.status(403).json({
        error: 'Password sign-in is disabled here. Use your college Google account.',
      });
    }

    if (!user.approved) {
      return res.status(403).json({ error: 'Your account is awaiting approval by your HOD.' });
    }

    const session = await startSession(res, user, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    res.json({ message: 'Logged in successfully', ...session });
  } catch (error) {
    next(error);
  }
};

// Called on page load and whenever the access token expires. Rotates the
// refresh cookie every time.
export const refresh = async (req, res, next) => {
  try {
    const result = await rotateRefreshToken(refreshCookieFrom(req), {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      token: result.accessToken,
      expiresInMinutes: config.auth.accessTokenMinutes,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        departmentId: result.user.departmentId,
        approved: result.user.approved,
        avatarUrl: result.user.avatarUrl,
      },
    });
  } catch (error) {
    // A failed refresh always clears the cookie, so a broken session cannot
    // wedge the client in a retry loop.
    clearRefreshCookie(res);
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await revokeToken(refreshCookieFrom(req));
    clearRefreshCookie(res);
    res.json({ message: 'Signed out.' });
  } catch (error) {
    next(error);
  }
};

// "Sign out everywhere": every device holding a refresh token for this
// account loses it at its next refresh, within the access token lifetime.
export const logoutEverywhere = async (req, res, next) => {
  try {
    const result = await revokeAllForUser(req.user.id);
    clearRefreshCookie(res);

    res.json({
      message: `Signed out of ${result.count} session(s). Other devices will be signed out within ${config.auth.accessTokenMinutes} minutes.`,
      sessions: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, departmentId: true, department: { select: { code: true, name: true } } }
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
};
