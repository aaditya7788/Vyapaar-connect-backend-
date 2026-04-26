const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Create a transporter for sending emails
 */
const transporter = nodemailer.createTransport({
  host: env.SMTP.HOST,
  port: env.SMTP.PORT,
  secure: env.SMTP.PORT === 465, // true for 465, false for other ports
  auth: {
    user: env.SMTP.USER,
    pass: env.SMTP.PASS,
  },
});

/**
 * Generate a 4-digit numeric OTP
 */
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Send an OTP email
 * @param {string} email - Recipient email address
 * @param {string} otp - The 4-digit OTP
 */
const sendOTPEmail = async (email, otp) => {
  // Only send emails in production to save SES quota during development
  if (env.APP_ENV !== 'production') {
    console.log('────────────────────────────────────────────────');
    console.log('[Mail Status] SIMULATED (Dev Mode)');
    console.log(`[Mail Status] Recipient: ${email}`);
    console.log(`[Mail Status] OTP Code: ${otp}`);
    console.log('────────────────────────────────────────────────');
    return { success: true, simulated: true, otp };
  }

  try {
    const themeColor = '#4F8F6A'; // Vyapaar Connect Primary Green
    const mailOptions = {
      from: env.SMTP.FROM,
      to: email,
      subject: 'Your OnePointSolution Verification Code',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: ${themeColor}; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">OnePointSolution</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Secure Verification Service</p>
          </div>
          
          <div style="text-align: center; padding: 30px; background-color: #f1f6f4; border-radius: 12px; margin-bottom: 30px;">
            <p style="color: #4A4A4A; font-size: 16px; margin-bottom: 20px; margin-top: 0;">Enter this code to verify your identity:</p>
            <div style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: ${themeColor}; text-shadow: 1px 1px 0px rgba(0,0,0,0.05);">
              ${otp}
            </div>
          </div>
          
          <div style="color: #777; font-size: 13px; line-height: 1.6; text-align: center;">
            <p>This code is valid for 10 minutes. <br/>If you did not request this, please ignore this email.</p>
          </div>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
            <p style="font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;">
              &copy; ${new Date().getFullYear()} OnePointSolution. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('────────────────────────────────────────────────');
    console.log('[Mail Status] SUCCESS');
    console.log(`[Mail Status] Recipient: ${email}`);
    console.log(`[Mail Status] MessageID: ${info.messageId}`);
    console.log('────────────────────────────────────────────────');

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.log('────────────────────────────────────────────────');
    console.log('[Mail Status] FAILED');
    console.log(`[Mail Status] Recipient: ${email}`);
    console.log(`[Mail Status] Error: ${error.message}`);
    console.log('────────────────────────────────────────────────');

    throw new Error('Failed to send verification email');
  }
};

/**
 * Send a Phone OTP via Email (Fallback/Admin notification)
 * @param {string} phone - The user's phone number
 * @param {string} otp - The 4-digit OTP
 */
const sendPhoneOTPEmail = async (phone, otp, targetEmail = null) => {
  const recipient = targetEmail || env.SMTP.TEST_RECIPIENT;

  // Only send in production
  if (env.APP_ENV !== 'production') {
    console.log('────────────────────────────────────────────────');
    console.log('[Mail Status] SIMULATED PHONE OTP (Dev Mode)');
    console.log(`[Mail Status] Destination: ${recipient}`);
    console.log(`[Mail Status] Phone: ${phone}`);
    console.log(`[Mail Status] OTP Code: ${otp}`);
    console.log('────────────────────────────────────────────────');
    return { success: true, simulated: true };
  }

  try {
    const themeColor = '#F4A261'; // Use Orange/Accent color for Phone OTPs to distinguish
    const mailOptions = {
      from: env.SMTP.FROM,
      to: recipient,
      subject: `Phone Verification Code for ${phone}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: ${themeColor}; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">OnePointSolution</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Phone Login Verification</p>
          </div>
          
          <div style="text-align: center; padding: 30px; background-color: #fff9f5; border-radius: 12px; margin-bottom: 30px;">
            <p style="color: #4A4A4A; font-size: 16px; margin-bottom: 10px; margin-top: 0;">Verification for: <b>${phone}</b></p>
            <p style="color: #4A4A4A; font-size: 14px; margin-bottom: 20px;">Use this 4-digit code to log in:</p>
            <div style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: ${themeColor};">
              ${otp}
            </div>
          </div>
          
          <p style="font-size: 11px; color: #aaa; text-align: center; text-transform: uppercase;">
            &copy; ${new Date().getFullYear()} OnePointSolution Dispatch
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('────────────────────────────────────────────────');
    console.log('[Mail Status] PHONE OTP EMAIL SENT');
    console.log(`[Mail Status] Recipient: ${recipient}`);
    console.log(`[Mail Status] Phone: ${phone}`);
    console.log(`[Mail Status] MessageID: ${info.messageId}`);
    console.log('────────────────────────────────────────────────');
    return { success: true };
  } catch (error) {
    console.error(`[Mail] Error sending Phone OTP email:`, error);
    return { success: false };
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendPhoneOTPEmail,
  transporter,
};
