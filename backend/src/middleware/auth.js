import jwt from 'jsonwebtoken';
import config from '../config.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    // Debug logging as requested
    console.log('--- AUTH DEBUG ---');
    console.log('Path:', req.path);
    console.log('User from Token:', req.user);
    console.log('Required Role(s):', roles);

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user found in request' });
    }

    const userRole = req.user.role;
    const isAllowed = Array.isArray(roles) 
      ? roles.includes(userRole) 
      : userRole === roles;

    if (!isAllowed) {
      console.log('Access Denied: Role mismatch');
      return res.status(403).json({ 
        error: `Forbidden: Requires ${Array.isArray(roles) ? roles.join(' or ') : roles} role`,
        yourRole: userRole
      });
    }

    console.log('Access Granted');
    next();
  };
};
