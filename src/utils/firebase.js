const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return admin;

    try {
        // Path to the service account JSON
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
            ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
            : path.join(__dirname, '../config/firebase-service-account.json');

        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin initialized successfully');
        isInitialized = true;
        return admin;
    } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        console.warn('⚠️ Push notifications will not be functional until Firebase is set up.');
        return null;
    }
};

module.exports = {
    admin,
    initializeFirebase,
    getMessaging: () => isInitialized ? admin.messaging() : null
};
