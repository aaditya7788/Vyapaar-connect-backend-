/**
 * Resolve relative avatar URLs to absolute URLs
 */
const resolveAvatarUrl = (user, req) => {
  if (!user || !user.avatar) return null;
  const env = require('../config/env');

  // 1. Handle Absolute URLs
  if (user.avatar.startsWith('http')) {
    // If it's a legacy URL pointing to old server's uploads, translate to S3
    if (user.avatar.includes('/uploads/') && env.AWS?.S3_BASE_URL && !user.avatar.includes(env.AWS.S3_BASE_URL)) {
      const parts = user.avatar.split('/uploads/');
      return `${env.AWS.S3_BASE_URL}/uploads/${parts[1]}`;
    }
    return user.avatar;
  }

  // 2. Handle Relative Upload Paths
  if (user.avatar.startsWith('/uploads') || user.avatar.startsWith('uploads')) {
    const normalizedPath = user.avatar.startsWith('/') ? user.avatar.substring(1) : user.avatar;
    return `${env.AWS.S3_BASE_URL}/${normalizedPath}`;
  }

  return user.avatar;
};

module.exports = {
  resolveAvatarUrl
};
