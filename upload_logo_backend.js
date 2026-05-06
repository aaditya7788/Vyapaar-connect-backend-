const fs = require('fs');
const path = require('path');
const { uploadToS3 } = require('./src/utils/s3Service');
const env = require('./src/config/env');

async function uploadLogo() {
    try {
        // Path to icon from backend/ directory: ../assets/icon.png
        const logoPath = path.join(__dirname, '../assets/icon.png');
        if (!fs.existsSync(logoPath)) {
            console.error('Logo not found at:', logoPath);
            return;
        }

        const fileContent = fs.readFileSync(logoPath);
        const relativePath = await uploadToS3(fileContent, 'app-logo.png', 'branding', 'image/png');
        
        const fullUrl = `${env.AWS.S3_BASE_URL}${relativePath}`;
        console.log('UPLOAD_SUCCESSFUL');
        console.log('URL:', fullUrl);
    } catch (error) {
        console.error('UPLOAD_FAILED:', error.message);
    }
}

uploadLogo();
