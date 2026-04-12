const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db');

/**
 * Standard Auth Middleware
 * Verifies access token, fetches user, and ensures status is active.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'No access token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    if (decoded.type !== 'access') {
      return res.status(403).json({ status: 'error', message: 'Invalid token type' });
    }

    // Fetch user from DB to ensure they exist and are active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || user.status !== 'active') {
      return res.status(403).json({ status: 'error', message: 'User account is restricted or not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired access token' });
  }
};

/**
 * Role-based Middleware
 * @param {String} requiredRole - e.g. 'provider'
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles.includes(requiredRole)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden: This action requires the '${requiredRole}' role`,
      });
    }
    next();
  };
};

const adminMiddleware = requireRole('admin');

module.exports = {
  authMiddleware,
  requireRole,
  adminMiddleware,
};
