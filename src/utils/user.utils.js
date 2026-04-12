/**
 * Resolve relative avatar URLs to absolute URLs
 */
const resolveAvatarUrl = (user, req) => {
  if (user && user.avatar && user.avatar.startsWith('/uploads')) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}${user.avatar}`;
  }
  return user?.avatar;
};

module.exports = {
  resolveAvatarUrl
};
