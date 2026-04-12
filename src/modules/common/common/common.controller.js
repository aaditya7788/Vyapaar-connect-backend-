/**
 * Handle Single File Upload for Common Assets
 */
const uploadSingle = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    // Relative path for the client
    const filePath = `/${req.file.path.replace(/\\/g, '/')}`;
    
    res.status(200).json({ 
      status: 'success', 
      message: 'File uploaded successfully',
      url: filePath
    });
  } catch (error) {
    console.error('[UPLOAD ERROR]:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  uploadSingle
};
