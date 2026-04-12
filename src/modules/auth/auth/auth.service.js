const prisma = require('../../../db');
const { generateId, generateAccessToken, generateRefreshToken } = require('../../../utils/auth.utils');

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

  const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes

  targetMap.set(key, { otp, lastSentAt: now, expiresAt });
  return otp;
};

/**
 * Send Phone OTP (Register/Login)
 */
const sendPhoneOtp = async (phone) => {
  const otp = prepareOtp(phoneOtps, phone);
  console.log(`[AUTH] Phone OTP for ${phone}: ${otp}`);
  // Return OTP in response for development visibility
  return { 
    message: 'Phone OTP sent successfully (DEV: Check console)', 
    phone,
    otp: process.env.NODE_ENV === 'development' ? otp : undefined 
  };
};

/**
 * Verify Phone OTP (Unified Flow)
 */
const verifyPhoneOtp = async (phone, otp, becomeProvider = false) => {
  // Bypass OTP check for externally verified sources (Truecaller/Firebase fallback in Dev)
  const isBypassed = otp === 'TRUECALLER_VERIFIED' || (process.env.NODE_ENV === 'development' && otp === 'FIREBASE_VERIFIED');
  
  if (!isBypassed) {
    const record = phoneOtps.get(phone);

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
      const err = new Error('Invalid or expired OTP');
      err.status = 400;
      throw err;
    }
    phoneOtps.delete(phone);
  } else {
    console.log(`[AUTH] OTP Bypass applied for ${phone} via ${otp}`);
  }

    const includeOptions = {
        providerProfile: {
            include: { shops: true }
        }
    };

    let user = await prisma.user.findUnique({
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
            data: { phoneVerified: true, status: 'active' },
            include: includeOptions
        });
    }

    if (user.status !== 'active') {
        const err = new Error('User account is restricted');
        err.status = 403;
        throw err;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user.id);

    // Store Session
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt },
    });

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
            providerProfile: user.providerProfile, // <--- ADDED
        },
    };
};

/**
 * Complete Profile
 */
const completeProfile = async (userId, { fullName, surname, email, city, state, bio }) => {
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

  const user = await prisma.user.update({
    where: { id: userId },
    data: { fullName, surname, email, city, state, bio, isProfileComplete: true },
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
  console.log(`[AUTH] Email OTP for ${email}: ${otp}`);
  return { message: 'Email OTP sent successfully' };
};

/**
 * Verify Email OTP
 */
const verifyEmailOtp = async (email, otp, userId) => {
  const record = emailOtps.get(email);
  if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
    const err = new Error('Invalid or expired OTP');
    err.status = 400;
    throw err;
  }

  emailOtps.delete(email);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { email, emailVerified: true },
    include: {
      providerProfile: {
        include: { shops: true }
      }
    }
  });

  return { 
    message: 'Email verified successfully',
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

  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: storedToken.userId },
  });

  if (!user || user.status !== 'active') {
    const err = new Error('User account is restricted');
    err.status = 403;
    throw err;
  }

  // Generate new access token
  const accessToken = generateAccessToken(user);

  return { accessToken };
};

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
  completeProfile,
  sendEmailOtp,
  verifyEmailOtp,
  logout,
  refreshAccessToken,
};
