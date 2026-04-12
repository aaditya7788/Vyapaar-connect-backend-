const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return admin;

    try {
        let serviceAccount;

        // Priority 1: Use environment variables directly (Best for Production/Render)
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
            console.log('🔐 Initializing Firebase Admin using environment variables...');
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            };
        } 
        // Priority 2: Use service account JSON file (Local development fallback)
        else {
            const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
                ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
                : path.join(__dirname, '../config/firebase-service-account.json');

            console.log(`📂 Attempting to load Firebase service account from file: ${serviceAccountPath}`);
            try {
                serviceAccount = require(serviceAccountPath);
            } catch (fileError) {
                throw new Error(`Firebase credentials missing. Provide environment variables or a valid JSON file. (Error: ${fileError.message})`);
            }
        }

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
