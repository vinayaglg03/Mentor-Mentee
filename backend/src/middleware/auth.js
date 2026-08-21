import jwt from 'jsonwebtoken';
import config from '../config.js';
import { can, atLeast } from '../lib/access.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, config.jwtSecret, (err, user) => {
    // A bad or expired token is an authentication problem (401), not an
    // authorisation one - the client logs out and asks for credentials again.
    if (err) return res.sendStatus(401);
    req.user = user;
    next();
  });
};

// Prefer this over requireRole: the rule itself lives in lib/access.js, so
// routes say what they need rather than which roles happen to have it today.
export const requirePermission = (action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

      if (await can(req.user, action)) return next();

      res.status(403).json({ error: `You do not have permission to ${action.replace(':', ' ')}.` });
    } catch (error) {
      next(error);
    }
  };
};

// "This role or wider". Every staff role can reach MENTOR-level endpoints;
// the record-level scoping is what actually limits them.
export const requireRoleAtLeast = (role) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (atLeast(req.user, role)) return next();
    res.status(403).json({ error: `This action needs the ${role.replace('_', ' ').toLowerCase()} role or above.` });
  };
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user found in request' });
    }

    const userRole = req.user.role;
    const isAllowed = Array.isArray(roles) 
      ? roles.includes(userRole) 
      : userRole === roles;

    if (!isAllowed) {
      return res.status(403).json({
        error: `Forbidden: Requires ${Array.isArray(roles) ? roles.join(' or ') : roles} role`
      });
    }

    next();
  };
};
