const authService = require('./auth.service');
const { resolveAvatarUrl } = require('../../../utils/user.utils');

const sendPhoneOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ status: 'fail', message: 'Phone number is required' });
    const result = await authService.sendPhoneOtp(phone);
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const verifyPhoneOtp = async (req, res) => {
  try {
    const { phone, otp, becomeProvider } = req.body;
    if (!phone || !otp) return res.status(400).json({ status: 'fail', message: 'Phone and OTP are required' });
    const result = await authService.verifyPhoneOtp(phone, otp, becomeProvider);

    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }

    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const completeProfile = async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const result = await authService.completeProfile(req.user.id, { fullName, email });
    
    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }
    
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
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
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ status: 'fail', message: 'Email and OTP are required' });
    const result = await authService.verifyEmailOtp(email, otp, req.user.id);

    // Resolve avatar URL
    if (result.user) {
      result.user.avatar = resolveAvatarUrl(result.user, req);
    }

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

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
  completeProfile,
  sendEmailOtp,
  verifyEmailOtp,
  logout,
  refreshToken,
};
