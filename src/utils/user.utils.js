/**
 * Resolve relative avatar URLs to absolute URLs
 */
const resolveAvatarUrl = (user, req) => {
  if (!user || !user.avatar) return null;

  // If already a full URL (S3), return it
  if (user.avatar.startsWith('http')) {
    return user.avatar;
  }

  // If local upload path
  if (user.avatar.startsWith('/uploads')) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}${user.avatar}`;
  }

  return user.avatar;
};

module.exports = {
  resolveAvatarUrl
};
