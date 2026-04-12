const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure directories exist helper
const ensureDir = (dir) => {
  const absolutePath = path.resolve(dir);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine folder from request (e.g. from a previous middleware or field)
    const folder = req.uploadFolder || 'uploads/common';
    ensureDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    // Priority: use custom filename from query if provided
    let name = req.query.filename || uuidv4();
    // Clean filename (remove non-alphanumeric except underscore/hyphen)
    name = name.toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
    
    cb(null, `${name}${path.extname(file.originalname)}`);
  }
});


const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = { upload };
