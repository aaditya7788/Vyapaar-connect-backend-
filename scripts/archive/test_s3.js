require('dotenv').config();
const { uploadToS3 } = require('./src/utils/s3Service');

async function testS3() {
  console.log('--- S3 Upload Test ---');
  console.log('Bucket:', process.env.AWS_S3_BUCKET_NAME);
  
  const testContent = Buffer.from('Hello from OnePointSolution S3 Test!');
  const testFileName = 'test-file.txt';

  try {
    const url = await uploadToS3(testContent, testFileName, 'tests', 'text/plain');
    console.log('✅ SUCCESS!');
    console.log('Public URL:', url);
    process.exit(0);
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Check your AWS_SECRET_ACCESS_KEY. Remember: SMTP passwords are NOT the same as IAM Secret Keys.');
    process.exit(1);
  }
}

// Load env before running
testS3();
