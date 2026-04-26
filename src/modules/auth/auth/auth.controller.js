const authService = require('./auth.service');
const { resolveAvatarUrl } = require('../../../utils/user.utils');

const sendPhoneOtp = async (req, res) => {
  try {
    const { phone, email } = req.body;
    if (!phone) return res.status(400).json({ status: 'fail', message: 'Phone number is required' });
    const result = await authService.sendPhoneOtp(phone, email);
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const verifyPhoneOtp = async (req, res) => {
  try {
    const { phone, otp, becomeProvider, deviceName, platform, forceLogout, firebaseToken } = req.body;
    if (!phone || (!otp && !firebaseToken)) return res.status(400).json({ status: 'fail', message: 'Phone and (OTP or FirebaseToken) are required' });
    
    const metadata = {
      deviceName,
      platform,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    const result = await authService.verifyPhoneOtp(phone, otp, becomeProvider, metadata, req.user, forceLogout, firebaseToken);

    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }

    console.log('[DEBUG] Verify Phone OTP Result:', JSON.stringify(result, null, 2));
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const completeProfile = async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    const result = await authService.completeProfile(req.user.id, { fullName, email, phone });
    
    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }
    
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: 'fail', message: 'Email is required' });
    const result = await authService.sendEmailOtp(email);
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp, deviceName, platform, forceLogout, firebaseToken } = req.body;
    if (!email || (!otp && !firebaseToken)) return res.status(400).json({ status: 'fail', message: 'Email and (OTP or FirebaseToken) are required' });
    
    const metadata = {
      deviceName,
      platform,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    const result = await authService.verifyEmailOtp(email, otp, metadata, forceLogout, firebaseToken);

    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }

    console.log('[DEBUG] Verify Email OTP Result:', JSON.stringify(result, null, 2));
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const googleSignin = async (req, res) => {
  try {
    const { googlePayload, deviceName, platform, forceLogout } = req.body;
    
    const metadata = {
        deviceName,
        platform,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    const result = await authService.googleSignin(googlePayload, metadata, forceLogout);

    if (result.user) {
        result.user.avatar = resolveAvatarUrl(result.user, req);
    }

    console.log('[DEBUG] Google Signin Result:', JSON.stringify(result, null, 2));
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_REACHED') {
      return res.status(403).json({ 
        status: 'fail', 
        code: 'SESSION_LIMIT_REACHED', 
        message: err.message,
        sessions: err.sessions 
      });
    }
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const listSessions = async (req, res) => {
    try {
        const { currentToken } = req.query;
        const result = await authService.listSessions(req.user.id, currentToken);
        res.status(200).json({ status: 'success', sessions: result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const logoutOtherDevices = async (req, res) => {
    try {
        const { currentRefreshToken } = req.body;
        const result = await authService.logoutAllOtherDevices(req.user.id, currentRefreshToken);
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const logoutSpecificDevice = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await authService.logoutSpecificDevice(req.user.id, sessionId);
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const result = await authService.logout(refreshToken);
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;
        const result = await authService.refreshAccessToken(token);
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const checkAvailability = async (req, res) => {
    try {
        const { email, phone } = req.query;
        const result = await authService.checkAvailability({ email, phone });
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
  completeProfile,
  sendEmailOtp,
  verifyEmailOtp,
  googleSignin,
  listSessions,
  logoutOtherDevices,
  logoutSpecificDevice,
  logout,
  refreshToken,
  checkAvailability,
};
