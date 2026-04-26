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
      include: { refreshTokens: true }
    });

    if (!user || user.status !== 'active') {
      const isBlocked = user?.status === 'blocked';
      return res.status(403).json({ 
        status: 'error', 
        code: isBlocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_RESTRICTED',
        message: isBlocked ? (user.blockReason || 'Your account has been blocked by an administrator.') : 'User account is restricted or not found',
        reason: user?.blockReason
      });
    }

    // SESSION VERIFICATION: If token has a sessionId, verify it still exists in DB
    if (decoded.sessionId) {
      const isSessionActive = user.refreshTokens.some(s => s.id === decoded.sessionId);
      if (!isSessionActive) {
        return res.status(401).json({ status: 'error', code: 'SESSION_EXPIRED', message: 'Session expired or logged out from another device' });
      }
    }

    req.user = user;
    req.sessionId = decoded.sessionId;
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired access token' });
  }
};

/**
 * Optional Auth Middleware
 * Sets req.user if valid token is present, otherwise continues without error.
 */
const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

        if (decoded.type === 'access') {
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                include: { refreshTokens: true }
            });
            if (user && user.status === 'active') {
                // Also check session for optional middleware if it exists
                const isSessionActive = !decoded.sessionId || user.refreshTokens.some(s => s.id === decoded.sessionId);
                if (isSessionActive) {
                    req.user = user;
                }
            }
        }
        next();
    } catch (error) {
        // Just continue without req.user
        next();
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
  optionalAuthMiddleware,
  requireRole,
  adminMiddleware,
};
