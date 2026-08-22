import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prismaClient.js';
import config from '../config.js';
import { assertCan, ForbiddenError } from '../lib/access.js';

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

// Public self-registration. Always creates an unapproved MENTOR:
// the role is never taken from the request body, and an HOD must approve
// the account before it can log in.
export const register = async (req, res, next) => {
  try {
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
    await assertCanAdminister(req.user, id);

    const user = await prisma.user.update({
      where: { id },
      data: { approved: true },
      select: { id: true, name: true, email: true, role: true, approved: true }
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
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.approved) {
      return res.status(403).json({ error: 'Your account is awaiting approval by your HOD.' });
    }

    const token = signToken(user);

    res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId
      }
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
