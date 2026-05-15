const { generateSecret, generateURI, verify } = require('otplib');
const qrcode = require('qrcode');
const prisma = require('../../../db');
const { generateAccessToken, generateRefreshToken } = require('../../../utils/auth.utils');
const { createSession } = require('../../auth/auth/auth.service');

/**
 * @desc Generate 2FA Secret & QR Code
 * @route GET /api/admin/auth/2fa/setup
 */
exports.setup2FA = async (req, res) => {
    try {
        let user = req.user;
        const { email } = req.query;

        if (!user && email) {
            user = await prisma.user.findUnique({ where: { email } });
        }

        if (!user) {
            return res.status(401).json({ status: 'fail', message: 'Authentication required' });
        }
        
        // 1. Generate a new secret for the user
        const secret = generateSecret();
        
        // 2. Create the otpauth URL (Standard for Google Authenticator)
        // In v13, generateURI takes an object
        const otpauth = generateURI({
            secret,
            label: user.email,
            issuer: 'Vyapaar Connect Admin'
        });
        
        // 3. Generate QR Code Data URL
        const qrCodeUrl = await qrcode.toDataURL(otpauth);
        
        // 4. Temporarily store secret (but don't enable yet)
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorSecret: secret }
        });

        res.status(200).json({
            status: 'success',
            data: {
                qrCodeUrl,
                secret // Also provide secret for manual entry
            }
        });
    } catch (error) {
        console.error('[2FA Setup Error]:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Verify first 2FA code to enable it
 * @route POST /api/admin/auth/2fa/enable
 */
exports.enable2FA = async (req, res) => {
    try {
        const { code, email, deviceName, platform } = req.body;
        let user = req.user;

        if (!user && email) {
            user = await prisma.user.findUnique({ 
                where: { email },
                include: { providerProfile: { include: { shops: true } } }
            });
        }

        if (!user) {
            return res.status(401).json({ status: 'fail', message: 'User not found' });
        }

        if (!user.twoFactorSecret) {
            return res.status(400).json({ status: 'fail', message: '2FA setup not initiated' });
        }

        // Verify the code against the stored secret
        // In v13, verify takes an object
        const isValid = await verify({ 
            token: code, 
            secret: user.twoFactorSecret 
        });

        if (!isValid || !isValid.valid) {
            return res.status(400).json({ status: 'fail', message: 'Invalid verification code' });
        }

        // Enable 2FA permanently
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorEnabled: true }
        });

        // --- AUTO LOGIN: Generate Final Tokens ---
        const metadata = {
            deviceName: deviceName || 'Web Admin',
            platform: platform || 'web-admin',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
        };

        const refreshToken = generateRefreshToken(user.id);
        const sessionId = await createSession(user.id, refreshToken, metadata.deviceName, metadata.platform, metadata.ipAddress);
        const accessToken = generateAccessToken(user, sessionId);

        res.status(200).json({
            status: 'success',
            message: 'Two-Factor Authentication enabled successfully',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                roles: user.roles,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('[2FA Enable Error]:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Disable 2FA
 */
exports.disable2FA = async (req, res) => {
    try {
        const { code } = req.body;
        const user = req.user;

        const isValid = await verify({ 
            token: code, 
            secret: user.twoFactorSecret 
        });

        if (!isValid || !isValid.valid) {
            return res.status(400).json({ status: 'fail', message: 'Invalid code. Cannot disable 2FA.' });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { 
                twoFactorEnabled: false,
                twoFactorSecret: null 
            }
        });

        res.status(200).json({
            status: 'success',
            message: 'Two-Factor Authentication disabled'
        });
    } catch (error) {
        console.error('[2FA Disable Error]:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Verify 2FA code during login (MFA Step)
 */
exports.verify2FA = async (req, res) => {
    try {
        const { code, email, deviceName, platform } = req.body;
        
        const user = await prisma.user.findUnique({
            where: { email },
            include: { providerProfile: { include: { shops: true } } }
        });

        if (!user || !user.twoFactorSecret) {
            return res.status(401).json({ status: 'fail', message: 'Authentication failed' });
        }

        const isValid = await verify({ 
            token: code, 
            secret: user.twoFactorSecret 
        });

        if (!isValid || !isValid.valid) {
            return res.status(400).json({ status: 'fail', message: 'Invalid Authenticator code' });
        }

        // --- SUCCESS: Generate Final Tokens ---
        const metadata = {
            deviceName: deviceName || 'Web Admin',
            platform: platform || 'web',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
        };

        const refreshToken = generateRefreshToken(user.id);
        const sessionId = await createSession(user.id, refreshToken, metadata.deviceName, metadata.platform, metadata.ipAddress);
        const accessToken = generateAccessToken(user, sessionId);

        res.status(200).json({
            status: 'success',
            message: 'MFA Verified',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                roles: user.roles,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('[2FA Verify Error]:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};
