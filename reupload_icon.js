const fs = require('fs');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const env = require('./src/config/env');

async function uploadLogoAsIcon() {
    const s3Client = new S3Client({
        region: env.AWS.REGION,
        credentials: {
            accessKeyId: env.AWS.ACCESS_KEY_ID,
            secretAccessKey: env.AWS.SECRET_ACCESS_KEY,
        },
    });

    try {
        const logoPath = path.join(__dirname, '../assets/icon.png');
        const fileContent = fs.readFileSync(logoPath);
        
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: env.AWS.S3_BUCKET_NAME,
                Key: 'uploads/branding/icon.png',
                Body: fileContent,
                ContentType: 'image/png',
            },
        });

        await upload.done();
        const fullUrl = `${env.AWS.S3_BASE_URL}/uploads/branding/icon.png`.replace(/\/+/g, '/').replace('https:/', 'https://');
        console.log('UPLOAD_SUCCESSFUL');
        console.log('URL:', fullUrl);
    } catch (error) {
        console.error('UPLOAD_FAILED:', error.message);
    }
}

uploadLogoAsIcon();
