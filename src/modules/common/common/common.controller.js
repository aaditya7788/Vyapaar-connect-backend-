const { uploadToS3 } = require('../../../utils/s3Service');

/**
 * Handle Single File Upload for Common Assets
 */
const uploadSingle = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    // Determine folder (strip 'uploads/' prefix if present for S3)
    let folder = req.uploadFolder || 'common';
    folder = folder.replace(/^uploads\//, '');

    // Upload to S3
    const s3Url = await uploadToS3(
      req.file.buffer, 
      req.file.originalname, 
      folder, 
      req.file.mimetype
    );
    
    res.status(200).json({ 
      status: 'success', 
      message: 'File uploaded successfully',
      url: s3Url
    });
  } catch (error) {
    console.error('[UPLOAD ERROR]:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  uploadSingle
};
