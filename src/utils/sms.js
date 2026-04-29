const axios = require('axios');
const env = require('../config/env');

/**
 * Send OTP via MSG91
 * @param {string} phone - Mobile number with country code (e.g., 919876543210)
 * @param {string} otp - 4 or 6 digit OTP
 */
const sendMSG91OTP = async (phone, otp) => {
  // Only send in production
  if (env.APP_ENV !== 'production') {
    console.log('────────────────────────────────────────────────');
    console.log('[SMS Status] SIMULATED (Dev Mode)');
    console.log(`[SMS Status] Destination: ${phone}`);
    console.log(`[SMS Status] OTP Code: ${otp}`);
    console.log('────────────────────────────────────────────────');
    return { success: true, simulated: true };
  }

  try {
    const authKey = env.MSG91.AUTH_KEY;
    const templateId = env.MSG91.TEMPLATE_ID;

    if (!authKey || !templateId) {
      console.error('[SMS] MSG91 Configuration missing! Check .env (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID)');
      return { success: false, error: 'Config missing' };
    }

    // Sanitize phone: Remove '+' and ensure it's just numbers
    const cleanPhone = phone.replace(/\D/g, '');

    // MSG91 OTP API URL
    // Format: https://control.msg91.com/api/v5/otp?template_id=TEMPLATE_ID&mobile=MOBILE&authkey=AUTHKEY&otp=OTP
    const url = `https://control.msg91.com/api/v5/otp`;
    
    const response = await axios.get(url, {
      params: {
        template_id: templateId,
        mobile: cleanPhone,
        authkey: authKey,
        otp: otp
      }
    });

    if (response.data.type === 'success') {
      console.log(`[SMS Status] MSG91 SUCCESS for ${phone}`);
      return { success: true, msg91Response: response.data };
    } else {
      console.error(`[SMS Status] MSG91 ERROR for ${phone}:`, response.data);
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    console.error(`[SMS Status] MSG91 REQUEST FAILED for ${phone}:`, error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendMSG91OTP
};
