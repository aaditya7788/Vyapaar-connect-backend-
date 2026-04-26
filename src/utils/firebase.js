const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return admin;

    try {
        let serviceAccount;

        // 1. Try Environment Variables first (Recommended for Production/Render)
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
            console.log('🔄 Initializing Firebase using Environment Variables...');
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            };
        } 
        // 2. Fallback to Service Account JSON files
        else {
            const possiblePaths = [
                path.join(process.cwd(), 'src/config/firebase-service-account.json'),
                path.join(process.cwd(), 'backend/src/config/firebase-service-account.json'),
                path.join(__dirname, '../config/firebase-service-account.json')
            ];

            for (const p of possiblePaths) {
                const resolvedPath = path.resolve(p);
                try {
                    serviceAccount = require(resolvedPath);
                    console.log(`✅ Loaded Firebase service account from file: ${resolvedPath}`);
                    break;
                } catch (e) {
                    // Continue to next path
                }
            }
        }

        if (!serviceAccount) {
            throw new Error('Firebase credentials missing: Neither environment variables nor service-account.json found.');
        }

        // Standardize Private Key Format
        let key = serviceAccount.private_key || serviceAccount.privateKey;
        if (key) {
            // 1. Convert literal \n to real newlines
            key = key.replace(/\\n/g, '\n');
            
            // 2. Remove any surrounding quotes (sometimes added by dotenv or shells)
            key = key.replace(/^["']|["']$/g, '');
            
            // 3. Trim whitespace
            key = key.trim();

            // 4. Robust header/footer check - ensure they are on their own lines
            if (!key.includes('-----BEGIN PRIVATE KEY-----\n')) {
                key = key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n');
            }
            if (!key.includes('\n-----END PRIVATE KEY-----')) {
                key = key.replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
            }

            // Assign back to both possible property names just in case
            serviceAccount.private_key = key;
            serviceAccount.privateKey = key;
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
    getMessaging: () => isInitialized ? admin.messaging() : null,
    getFirestore: () => isInitialized ? admin.firestore() : null,
    getAuth: () => isInitialized ? admin.auth() : null
};
