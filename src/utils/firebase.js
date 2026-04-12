const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return admin;

    try {
        // Path to the service account JSON
        let serviceAccount;
        let serviceAccountPath;
        
        const possiblePaths = [
            process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
            path.join(process.cwd(), 'src/config/firebase-service-account.json'),
            path.join(process.cwd(), 'backend/src/config/firebase-service-account.json'),
            path.join(__dirname, '../config/firebase-service-account.json')
        ].filter(Boolean);

        for (const p of possiblePaths) {
            const resolvedPath = path.resolve(p);
            try {
                serviceAccount = require(resolvedPath);
                serviceAccountPath = resolvedPath;
                console.log(`✅ Loaded Firebase service account from: ${resolvedPath}`);
                break;
            } catch (e) {
                // Continue to next path
            }
        }
        
        if (!serviceAccount) {
            console.error(`❌ Could not find Firebase service account file in any of: ${possiblePaths.join(', ')}`);
            // Fallback to environment variables if possible
            if (process.env.FIREBASE_PRIVATE_KEY) {
                console.log('🔄 Attempting to initialize Firebase using environment variables...');
                serviceAccount = {
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                };
            } else {
                throw new Error(`Firebase service account file missing and no backup environment variables found.`);
            }
        }

        if (serviceAccount) {
            let key = serviceAccount.private_key || serviceAccount.privateKey;
            if (key) {
                // Remove literal \n, quotes, and trim whitespace/newlines
                key = key.replace(/\\n/g, '\n').replace(/"/g, '').trim();
                
                // If the key is one giant line, we must ensure it has proper newlines for the parser
                if (!key.includes('\n')) {
                    console.log('⚠️ Firebase key format fixed: Added missing newlines');
                    key = key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
                             .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
                }
                
                if (serviceAccount.private_key) serviceAccount.private_key = key;
                else if (serviceAccount.privateKey) serviceAccount.privateKey = key;
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
