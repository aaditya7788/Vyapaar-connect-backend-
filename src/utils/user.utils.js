/**
 * Resolve relative avatar URLs to absolute URLs
 */
const resolveAvatarUrl = (user, req) => {
  if (!user || !user.avatar) return null;

  // If already a full URL (S3), return it
  if (user.avatar.startsWith('http')) {
    return user.avatar;
  }

  // If path starts with /uploads, redirect to S3
  if (user.avatar.startsWith('/uploads')) {
    const env = require('../config/env');
    const normalizedPath = user.avatar.startsWith('/') ? user.avatar.substring(1) : user.avatar;
    return `${env.AWS.S3_BASE_URL}/${normalizedPath}`;
  }

  return user.avatar;
};

module.exports = {
  resolveAvatarUrl
};
