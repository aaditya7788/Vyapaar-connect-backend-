const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

const s3Client = new S3Client({
  region: env.AWS.REGION,
  credentials: {
    accessKeyId: env.AWS.ACCESS_KEY_ID,
    secretAccessKey: env.AWS.SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = env.AWS.S3_BUCKET_NAME;

/**
 * Uploads a file to S3
 * @param {Buffer | Stream} fileContent - The file content
 * @param {string} originalName - Original filename to extract extension
 * @param {string} folder - Destination folder in the bucket
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
const uploadToS3 = async (fileContent, originalName, folder = 'common', mimetype = 'image/jpeg') => {
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${uuidv4()}${ext}`;
  
  // Standardize folder path: ensure it starts with 'uploads/' and is lowercase
  const cleanFolder = folder
    .toLowerCase()
    .replace(/^uploads[\/\\]?/, '') // Remove prefix if already present to avoid doubling
    .replace(/[\/\\]+$/, '');       // Remove trailing slash
    
  const key = `uploads/${cleanFolder}/${filename}`.replace(/\/+/g, '/');


  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: mimetype,
      },
    });

    await upload.done();

    // Generate the public URL
    // Format: https://bucket-name.s3.region.amazonaws.com/key
    return `${env.AWS.S3_BASE_URL}/${key}`;
  } catch (error) {
    console.error('[S3] Upload Failed:', error.message);
    throw new Error('Failed to upload image to cloud storage');
  }
};

/**
 * Deletes a file from S3
 * @param {string} fileUrl - The full public URL of the file
 */
const deleteFromS3 = async (fileUrl) => {
  if (!fileUrl || !fileUrl.includes(BUCKET_NAME)) return;

  try {
    // Extract key from URL
    const urlParts = fileUrl.split(`${env.AWS.S3_BASE_URL}/`);
    if (urlParts.length < 2) return;
    
    const key = urlParts[1];

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`[S3] Deleted: ${key}`);
  } catch (error) {
    console.error('[S3] Delete Failed:', error.message);
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3
};
