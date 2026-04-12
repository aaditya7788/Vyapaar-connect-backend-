require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DIRECT_URL,
  TEMP_TOKEN_SECRET: process.env.TEMP_TOKEN_SECRET,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
};

module.exports = env;