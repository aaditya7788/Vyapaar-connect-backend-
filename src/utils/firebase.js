const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return admin;

    try {
        // Path to the service account JSON
        let serviceAccount;
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
            ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
            : path.join(__dirname, '../config/firebase-service-account.json');

        console.log(`🔍 Attempting to load Firebase service account from: ${serviceAccountPath}`);
        
        try {
            serviceAccount = require(serviceAccountPath);
        } catch (e) {
            console.error(`❌ Could not find Firebase service account file at: ${serviceAccountPath}`);
            // Fallback to environment variables if possible
            if (process.env.FIREBASE_PRIVATE_KEY) {
                console.log('🔄 Attempting to initialize Firebase using environment variables...');
                serviceAccount = {
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                };
            } else {
                throw new Error(`Firebase service account file missing and no backup environment variables found. Error: ${e.message}`);
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
