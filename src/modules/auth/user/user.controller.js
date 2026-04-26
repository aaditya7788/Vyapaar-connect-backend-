const prisma = require('../../../db');
const { resolveAvatarUrl } = require('../../../utils/user.utils');
const { deleteFile } = require('../../../utils/file.utils');

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

const { uploadToS3, deleteFromS3 } = require('../../../utils/s3Service');

/**
 * Update Profile Avatar
 */
const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'No image uploaded' });
    }

    // Get old user to delete previous file
    const oldUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true }
    });

    // Upload to S3
    const folder = req.uploadFolder || 'customer/avatars';
    const s3Url = await uploadToS3(
      req.file.buffer, 
      req.file.originalname, 
      folder, 
      req.file.mimetype
    );

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: s3Url }
    });

    // If update success, delete old file from S3 (if it was an S3 path)
    if (oldUser && oldUser.avatar && oldUser.avatar !== s3Url) {
        if (oldUser.avatar.startsWith('http') || oldUser.avatar.startsWith('/uploads')) {
          await deleteFromS3(oldUser.avatar);
        } else {
          // Fallback for purely local legacy files
          deleteFile(oldUser.avatar);
        }
    }

    res.status(200).json({ 
      status: 'success', 
      message: 'Avatar updated', 
      avatar: s3Url,
      user: { ...user, avatar: s3Url }
    });
  } catch (err) {
    console.error('[Avatar Update Error]:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
/**
 * Register/Update Push Token
 */
const registerPushToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    
    if (!token) {
      return res.status(400).json({ status: 'fail', message: 'Token is required' });
    }

    // 1. Clean up any stale token specifically associated with this session
    // This avoids "Replacing" conflicts because sessionId in PushToken is @unique
    if (req.sessionId) {
      await prisma.pushToken.deleteMany({
        where: { 
          sessionId: req.sessionId,
          token: { not: token } 
        }
      });
    }

    // 2. Upsert the token for this user + session
    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: { 
        userId: req.user.id, 
        sessionId: req.sessionId || null,
        platform: platform || 'unknown' 
      },
      create: { 
        token, 
        userId: req.user.id, 
        sessionId: req.sessionId || null,
        platform: platform || 'unknown' 
      }
    });

    console.log(`✅ [PushSync] User ${req.user.id} registered Native FCM Token: ${token.substring(0, 10)}... (${platform || 'unknown'})`);

    res.status(200).json({ status: 'success', message: 'Push token registered', data: pushToken });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * Get notification history for current user
 */
const getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Normalize image URLs in data payload
    const env = require('../../../config/env');
    const normalizedHistory = notifications.map(notif => {
      if (notif.data) {
        // Handle images in notification metadata
        const fixUrl = (url) => {
          if (!url || url.startsWith('http')) return url;
          if (url.startsWith('/uploads')) {
            const clean = url.startsWith('/') ? url.substring(1) : url;
            return `${env.AWS.S3_BASE_URL}/${clean}`;
          }
          const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
          return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        };

        if (notif.data.imageUrl) notif.data.imageUrl = fixUrl(notif.data.imageUrl);
        if (notif.data.sponsoredImageUrl) notif.data.sponsoredImageUrl = fixUrl(notif.data.sponsoredImageUrl);
      }
      return notif;
    });

    res.status(200).json({ status: 'success', data: normalizedHistory });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * Mark all notifications as read for current user
 */
const markNotificationsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });

    res.status(200).json({ status: 'success', message: 'Notifications marked as read' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * Delete a specific notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure notification belongs to user
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification || notification.userId !== req.user.id) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id }
    });

    res.status(200).json({ status: 'success', message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  registerPushToken,
  getNotifications,
  markNotificationsRead,
  deleteNotification
};
