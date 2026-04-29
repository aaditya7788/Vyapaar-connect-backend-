require('dotenv').config();

const appEnv = process.env.APP_ENV || 'development';
const nodeEnv = (process.env.NODE_ENV || appEnv).toLowerCase();
process.env.NODE_ENV = nodeEnv; // Ensure global process.env is in sync

const env = {
  APP_ENV: appEnv,
  NODE_ENV: nodeEnv,
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DIRECT_URL,
  TEMP_TOKEN_SECRET: process.env.TEMP_TOKEN_SECRET,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  SMTP: {
    HOST: process.env.SMTP_HOST,
    PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
    USER: process.env.SMTP_USER,
    PASS: process.env.SMTP_PASS,
    FROM: process.env.EMAIL_FROM,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM,
  },
  AWS: {
    REGION: process.env.AWS_REGION || 'ap-south-1',
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
    S3_BASE_URL: process.env.AWS_S3_BASE_URL || `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com`,
  },
  DEEP_LINK_DOMAIN: process.env.DEEP_LINK_DOMAIN || 'aaditya78.dev',
  MSG91: {
    AUTH_KEY: process.env.MSG91_AUTH_KEY,
    TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID,
  },
};

console.log('[Backend] ─── Environment Summary ───');
console.log(`[Backend] Mode: ${env.NODE_ENV.toUpperCase()}`);
console.log(`[Backend] App Env: ${env.APP_ENV.toUpperCase()}`);
console.log(`[Backend] Port: ${env.PORT}`);
console.log('[Backend] ────────────────────────────');

module.exports = env;