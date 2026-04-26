const prisma = require('../../../db');
const { generateId, generateAccessToken, generateRefreshToken } = require('../../../utils/auth.utils');
const { getIO } = require('../../../utils/socket');
const { getMessaging, getAuth } = require('../../../utils/firebase');
const { generateOTP, sendOTPEmail, sendPhoneOTPEmail } = require('../../../utils/mail');

// OTP Storage (Memory based for now)
const phoneOtps = new Map();
const emailOtps = new Map();

/**
 * Handle OTP Cooldown and Generation
 */
const prepareOtp = (targetMap, key) => {
  const now = Date.now();
  const record = targetMap.get(key);

  // 2-minute cooldown (120,000 ms)
  if (record && now - record.lastSentAt < 120000) {
    const waitTime = Math.ceil((120000 - (now - record.lastSentAt)) / 1000);
    const err = new Error(`Please wait ${waitTime} seconds before resending OTP`);
    err.status = 429;
    throw err;
  }

  const otp = generateOTP(); // Use centralized 4-digit generation
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes
  targetMap.set(key, { otp, lastSentAt: now, expiresAt });
  return otp;
};

/**
 * Verify Firebase ID Token
 * This is the primary verification method for production.
 */
const verifyFirebaseToken = async (firebaseToken) => {
  try {
    const auth = getAuth();
    if (!auth) throw new Error('Firebase Auth not initialized');
    
    // Verify the ID token sent from the client
    const decodedToken = await auth.verifyIdToken(firebaseToken);
    return decodedToken;
  } catch (error) {
    console.error('[AUTH] Firebase Token Verification Failed:', error.message);
    const err = new Error('Session verification failed. Please try logging in again.');
    err.status = 401;
    throw err;
  }
};

/**
 * Notify all other devices to logout immediately (Socket + FCM)
 */
const notifyOtherDevicesOfLogout = async (userId) => {
    try {
        // 1. Instant Socket Emit (if online)
        try {
            const io = getIO();
            io.to(`user_${userId}`).emit('SESSION_EXPIRED', { 
                message: 'You have been logged out from another device' 
            });
            console.log(`[AUTH] Socket Logout Emit sent to user_${userId}`);
        } catch (sErr) {
            // Silently skip if socket not init or user not connected
        }

        // 2. Silent FCM Push (if backgrounded)
        try {
            const messaging = getMessaging();
            if (messaging) {
                const tokens = await prisma.pushToken.findMany({
                    where: { userId },
                    select: { token: true }
                });
                
                if (tokens.length > 0) {
                    const deviceTokens = tokens.map(t => t.token);
                    await messaging.sendEachForMulticast({
                        tokens: deviceTokens,
                        data: {
                            type: 'SESSION_EXPIRED',
                        }
                    });
                    console.log(`[AUTH] FCM Logout Push sent to ${deviceTokens.length} tokens`);
                }
            }
        } catch (fErr) {
            console.warn('[AUTH] FCM notify failed:', fErr.message);
        }
    } catch (err) {
        console.error('[AUTH] Critical failure in notifyOtherDevicesOfLogout:', err.message);
    }
};

/**
 * Send Phone OTP (Register/Login)
 */
const sendPhoneOtp = async (phone, testEmail = null) => {
  const otp = prepareOtp(phoneOtps, phone);
  
  // Try to find if this user already has a verified email to send the code to
  let targetEmail = testEmail;
  if (!targetEmail) {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user && user.email && user.emailVerified) {
        targetEmail = user.email;
        console.log(`[AUTH] User has verified email, sending Phone OTP to: ${targetEmail}`);
    }
  }

  // Send the Phone OTP (fallbacks to Admin Email inside sendPhoneOTPEmail if targetEmail is null)
  await sendPhoneOTPEmail(phone, otp, targetEmail);

  // Return OTP in response for development visibility
  return {
    message: 'Phone OTP sent successfully',
    phone,
    otp: process.env.NODE_ENV === 'development' ? otp : undefined
  };
};

/**
 * Verify Phone OTP (Unified Flow)
 */
const verifyPhoneOtp = async (phone, otp, becomeProvider = false, metadata = {}, currentUser = null, forceLogout = false) => {
  let verifiedIdentifier = phone;

  // 1. Local OTP Verification
  const record = phoneOtps.get(phone);
  if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
    const err = new Error('Invalid or expired OTP');
    err.status = 400;
    throw err;
  }



  const includeOptions = {
    providerProfile: {
      include: { shops: true }
    }
  };

  let user;

  // --- Identity-Aware Path (Account Linking) ---
  if (currentUser) {
    // Check if this phone belongs to someone ELSE
    const existingWithPhone = await prisma.user.findFirst({
      where: { phone, id: { not: currentUser.id } }
    });

    if (existingWithPhone) {
      const err = new Error('This phone number is already associated with another account');
      err.status = 400;
      throw err;
    }

    // Link to current authenticated user
    user = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        phone,
        phoneVerified: true,
        isProfileComplete: (currentUser.fullName && currentUser.email) ? true : currentUser.isProfileComplete
      },
      include: includeOptions
    });
  } else {
    // --- Standard Path (Login/Signup via Phone) ---
    user = await prisma.user.findUnique({
      where: { phone },
      include: includeOptions
    });

    if (!user) {
      // New User Path
      const customerId = await generateId('CUST', 'customerId');
      let roles = ['customer'];
      let providerId = null;

      if (becomeProvider) {
        roles.push('provider');
        providerId = await generateId('SP', 'providerId');
      }

      user = await prisma.user.create({
        data: {
          phone,
          phoneVerified: true,
          customerId,
          providerId,
          roles,
          status: 'active',
          providerProfile: becomeProvider ? { create: { isActive: true } } : undefined,
        },
        include: includeOptions
      });
    } else {
      // Login Path
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          status: 'active',
          isProfileComplete: (user.fullName && user.email) ? true : user.isProfileComplete
        },
        include: includeOptions
      });
    }
  }

  if (user.status !== 'active') {
    const isBlocked = user.status === 'blocked';
    const err = new Error(isBlocked ? (user.blockReason || 'Your account has been blocked.') : 'User account is restricted');
    err.status = 403;
    err.code = isBlocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_RESTRICTED';
    err.reason = user.blockReason;
    throw err;
  }

  // Unified Session Management
  if (forceLogout) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await notifyOtherDevicesOfLogout(user.id);
  }

  const refreshToken = generateRefreshToken(user.id);
  const sessionId = await createSession(user.id, refreshToken, metadata.deviceName, metadata.platform, metadata.ipAddress);
  const accessToken = generateAccessToken(user, sessionId);

  // ONLY DELETE OTP ON FULL SUCCESS
  phoneOtps.delete(phone);


  return {
    message: 'Login successful',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      customerId: user.customerId,
      providerId: user.providerId,
      roles: user.roles,
      isProfileComplete: user.isProfileComplete,
      emailVerified: user.emailVerified,
      providerProfile: user.providerProfile,
    },
  };
};

/**
 * Multi-device session manager
 */
const createSession = async (userId, token, deviceName = null, platform = null, ipAddress = null) => {
  // 1. Check for existing session by DeviceName + Platform (Unified Device Identity)
  // We ignore IPAddress during finding to prevent collapsing different devices on the same network
  // and to allow the same device to resume its own session correctly.
  const nameToMatch = deviceName || 'Unknown Device';
  const platformToMatch = platform || 'unknown';

  const existingSession = await prisma.refreshToken.findFirst({
    where: {
      userId,
      deviceName: nameToMatch,
      platform: platformToMatch,
    }
  });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (existingSession) {
    console.log(`[AUTH] Resuming/Updating session for existing device: ${nameToMatch} (${platformToMatch})`);
    await prisma.refreshToken.update({
      where: { id: existingSession.id },
      data: {
        token,
        expiresAt,
        ipAddress, // Update IP for logging, but don't use it for uniqueness
        lastActive: new Date()
      }
    });
    return existingSession.id;
  }

  // 2. Check existing sessions count
  const activeSessions = await prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { lastActive: 'asc' }
  });

  // 3. Enforce limit from .env
  const maxSessions = parseInt(process.env.MAX_SESSIONS || '5');
  if (activeSessions.length >= maxSessions) {
    const err = new Error('Session limit reached. Please logout from other devices.');
    err.code = 'SESSION_LIMIT_REACHED';
    err.status = 403;
    err.sessions = activeSessions.map(s => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      lastActive: s.lastActive
    }));
    throw err;
  }

  // 4. Create new session
  const session = await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
      deviceName: nameToMatch,
      platform: platformToMatch,
      ipAddress,
      lastActive: new Date()
    },
  });
  return session.id;
};

/**
 * Complete Profile
 */
const completeProfile = async (userId, { fullName, surname, email, phone, city, state, bio }) => {
  // Check email collision
  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
    });
    if (existing) {
      const err = new Error('Email is already taken');
      err.status = 400;
      throw err;
    }
  }

  // Check phone collision if updating phone
  if (phone) {
    const existingPhone = await prisma.user.findFirst({
      where: { phone, id: { not: userId } },
    });
    if (existingPhone) {
      const err = new Error('Phone number is already associated with another account');
      err.status = 400;
      throw err;
    }
  }

  const currentUser = await prisma.user.findUnique({ where: { id: userId } });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      surname,
      email,
      phone: phone || undefined,
      city,
      state,
      bio,
      isProfileComplete: (fullName && (phone || currentUser.phone) && (currentUser.phoneVerified || currentUser.emailVerified)) ? true : false
    },
    include: {
      providerProfile: {
        include: { shops: true }
      }
    }
  });

  return {
    message: 'Profile updated',
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      customerId: user.customerId,
      providerId: user.providerId,
      roles: user.roles,
      isProfileComplete: user.isProfileComplete,
      emailVerified: user.emailVerified,
      providerProfile: user.providerProfile,
    }
  };
};

/**
 * Send Email OTP
 */
const sendEmailOtp = async (email) => {
  const otp = prepareOtp(emailOtps, email);
  
  // Actually send the email using our SES utility
  await sendOTPEmail(email, otp);
  
  return { message: 'Email OTP sent successfully' };
};

/**
 * Verify Email OTP
 */
const verifyEmailOtp = async (email, otp, metadata = {}, forceLogout = false) => {
  const record = emailOtps.get(email);
  if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
    const err = new Error('Invalid or expired OTP');
    err.status = 400;
    throw err;
  }



  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      providerProfile: {
        include: { shops: true }
      }
    }
  });

  if (!user) {
    // New User Path via Email
    const customerId = await generateId('CUST', 'customerId');
    user = await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        phone: `email_${Date.now()}`, // Placeholder since phone is unique
        phoneVerified: false,
        customerId,
        roles: ['customer'],
        status: 'active',
      },
      include: {
        providerProfile: {
          include: { shops: true }
        }
      }
    });
  } else {
    // Login Path
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        isProfileComplete: (user.fullName && user.phone && user.phoneVerified) ? true : user.isProfileComplete
      },
      include: {
        providerProfile: {
          include: { shops: true }
        }
      }
    });
  }

  if (user.status !== 'active') {
    const isBlocked = user.status === 'blocked';
    const err = new Error(isBlocked ? (user.blockReason || 'Your account has been blocked.') : 'User account is restricted');
    err.status = 403;
    err.code = isBlocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_RESTRICTED';
    err.reason = user.blockReason;
    throw err;
  }

  if (forceLogout) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await notifyOtherDevicesOfLogout(user.id);
  }

  const refreshToken = generateRefreshToken(user.id);
  const sessionId = await createSession(user.id, refreshToken, metadata.deviceName, metadata.platform, metadata.ipAddress);
  const accessToken = generateAccessToken(user, sessionId);

  // ONLY DELETE OTP ON FULL SUCCESS
  emailOtps.delete(email);

  return {
    message: 'Verification successful',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone.startsWith('email_') ? null : user.phone,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      customerId: user.customerId,
      providerId: user.providerId,
      roles: user.roles,
      isProfileComplete: user.isProfileComplete,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      providerProfile: user.providerProfile,
    }
  };
};

/**
 * Google Native Sign-in
 */
const googleSignin = async (googlePayload, metadata = {}, forceLogout = false) => {
  const { email, fullName, avatar, googleId } = googlePayload;

  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      providerProfile: { include: { shops: true } }
    }
  });

  if (!user) {
    // New User creation
    const customerId = await generateId('CUST', 'customerId');
    user = await prisma.user.create({
      data: {
        email,
        fullName,
        avatar: avatar || "/uploads/avatars/default.png",
        emailVerified: true,
        phone: `google_${Date.now()}`, // Placeholder
        phoneVerified: false,
        customerId,
        roles: ['customer'],
        status: 'active',
      },
      include: {
        providerProfile: { include: { shops: true } }
      }
    });
  } else {
    // Account Linking / Login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        // Only update name/avatar if they were missing
        fullName: user.fullName || fullName,
        avatar: user.avatar === "/uploads/avatars/default.png" ? avatar : user.avatar
      },
      include: {
        providerProfile: { include: { shops: true } }
      }
    });
  }

  if (user.status !== 'active') {
    const isBlocked = user.status === 'blocked';
    const err = new Error(isBlocked ? (user.blockReason || 'Your account has been blocked.') : 'User account is restricted');
    err.status = 403;
    err.code = isBlocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_RESTRICTED';
    err.reason = user.blockReason;
    throw err;
  }

  if (forceLogout) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await notifyOtherDevicesOfLogout(user.id);
  }

  const refreshToken = generateRefreshToken(user.id);
  const sessionId = await createSession(user.id, refreshToken, metadata.deviceName, metadata.platform, metadata.ipAddress);
  const accessToken = generateAccessToken(user, sessionId);

  return {
    message: 'Google login successful',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone.startsWith('google_') || user.phone.startsWith('email_') ? null : user.phone,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      customerId: user.customerId,
      providerId: user.providerId,
      roles: user.roles,
      isProfileComplete: user.isProfileComplete,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      providerProfile: user.providerProfile,
    }
  };
};

/**
 * List Active Sessions
 */
const listSessions = async (userId, currentToken) => {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { lastActive: 'desc' },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      lastActive: true,
      ipAddress: true,
      createdAt: true,
      token: true // need this for comparison
    }
  });

  return sessions.map(s => {
    const { token, ...data } = s;
    return {
      ...data,
      isCurrent: token === currentToken
    };
  });
};

/**
 * Logout from all other devices
 */
const logoutAllOtherDevices = async (userId, currentToken) => {
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      token: { not: currentToken }
    }
  });

  // Notify other devices to logout instantly
  await notifyOtherDevicesOfLogout(userId);

  return { message: 'Signed out from all other devices' };
};

/**
 * Logout specific device
 */
const logoutSpecificDevice = async (userId, sessionId) => {
  await prisma.refreshToken.deleteMany({
    where: { id: sessionId, userId }
  });

  // Trigger cross-device signal
  await notifyOtherDevicesOfLogout(userId);

  return { message: 'Device logged out' };
};

/**
 * Logout (Delete Refresh Token)
 */
const logout = async (refreshToken) => {
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }
  return { message: 'Logout successful' };
};

/**
 * Refresh Access Token
 */
const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    const err = new Error('Refresh token is required');
    err.status = 401;
    throw err;
  }

  // Find token in DB
  const storedToken = await prisma.refreshToken.findFirst({
    where: { token: refreshToken },
  });

  if (!storedToken || new Date() > storedToken.expiresAt) {
    const err = new Error('Refresh token expired or invalid');
    err.status = 401;
    throw err;
  }

  // Update last active
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { lastActive: new Date() }
  });

  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: storedToken.userId },
  });

  if (!user || user.status !== 'active') {
    const isBlocked = user?.status === 'blocked';
    const err = new Error(isBlocked ? (user.blockReason || 'Your account has been blocked.') : 'User account is restricted');
    err.status = 403;
    err.code = isBlocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_RESTRICTED';
    err.reason = user?.blockReason;
    throw err;
  }

  // Generate new access token
  const accessToken = generateAccessToken(user, storedToken.id);

  return { accessToken };
};

/**
 * Check Availability (Proactive Uniqueness Check)
 */
const checkAvailability = async ({ email, phone }) => {
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) return { available: false, type: 'email' };
  }
  if (phone) {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user) return { available: false, type: 'phone' };
  }
  return { available: true };
};

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
  completeProfile,
  sendEmailOtp,
  verifyEmailOtp,
  googleSignin,
  listSessions,
  logoutAllOtherDevices,
  logoutSpecificDevice,
  logout,
  refreshAccessToken,
  checkAvailability,
};
