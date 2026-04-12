const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db');

/**
 * Generate a Role-specific Business ID (Format: PREFIX_XXXXXX)
 * @param {String} prefix - 'CUST' or 'SP'
 * @param {String} field - 'customerId' or 'providerId'
 * @returns {String} unique identifier
 */
const generateId = async (prefix, field) => {
  const digits = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  const customId = `${prefix}_${digits}`;

  // Ensure uniqueness before returning
  const existingUser = await prisma.user.findUnique({
    where: { [field]: customId },
  });

  if (existingUser) {
    return generateId(prefix, field); // Recursion on collision
  }

  return customId;
};

/**
 * Generate an Access Token
 * Payload includes userId and roles array.
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, roles: user.roles, type: 'access' },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: '30m' }
  );
};

/**
 * Generate a Refresh Token
 * Payload includes userId.
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: '30d' }
  );
};

/**
 * Verify a token using a specific secret
 */
const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
};

module.exports = {
  generateId,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
};
