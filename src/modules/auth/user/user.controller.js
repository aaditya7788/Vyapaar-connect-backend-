const prisma = require('../../../db');
const { resolveAvatarUrl } = require('../../../utils/user.utils');

/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatar: true,
        customerId: true,
        providerId: true,
        roles: true,
        isProfileComplete: true,
      }
    });

    if (user) {
      user.avatar = resolveAvatarUrl(user, req);
    }

    res.status(200).json({ status: 'success', user });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * Update general profile data
 */
const updateProfile = async (req, res) => {
  try {
    const { fullName, email } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName, email }
    });

    res.status(200).json({ status: 'success', message: 'Profile updated', user });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * Update Profile Avatar
 */
const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'No image uploaded' });
    }

    // Store relative path in DB
    const relativePath = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: relativePath }
    });

    const fullAvatarUrl = resolveAvatarUrl(user, req);

    res.status(200).json({ 
      status: 'success', 
      message: 'Avatar updated', 
      avatar: fullAvatarUrl,
      user: { ...user, avatar: fullAvatarUrl }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};/**
 * Register/Update Push Token
 */
const registerPushToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    
    if (!token) {
      return res.status(400).json({ status: 'fail', message: 'Token is required' });
    }

    // Upsert the token for this user
    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: { 
        userId: req.user.id, 
        platform: platform || 'unknown' 
      },
      create: { 
        token, 
        userId: req.user.id, 
        platform: platform || 'unknown' 
      }
    });

    res.status(200).json({ status: 'success', message: 'Push token registered', data: pushToken });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  registerPushToken
};
