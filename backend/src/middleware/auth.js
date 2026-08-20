import jwt from 'jsonwebtoken';
import config from '../config.js';

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
