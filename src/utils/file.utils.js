const fs = require('fs');
const path = require('path');

/**
 * Safely delete a file from the server
 * @param {string} relativePath Relative path starting with /uploads
 */
const deleteFile = (relativePath) => {
    if (!relativePath || typeof relativePath !== 'string') return;

    try {
        // Remove leading slash if present for path joining
        const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
        const absolutePath = path.resolve(process.cwd(), cleanPath);

        // Security check: ensure path is within uploads directory
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        if (!absolutePath.startsWith(uploadsDir)) {
            console.warn(`[FILE CLEANUP]: Blocked attempt to delete file outside uploads: ${absolutePath}`);
            return;
        }

        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            console.log(`[FILE CLEANUP]: Deleted ${relativePath}`);
        } else {
            console.log(`[FILE CLEANUP]: File not found, skipping delete: ${relativePath}`);
        }
    } catch (error) {
        console.error(`[FILE CLEANUP ERROR]: ${error.message}`);
    }
};

/**
 * Delete multiple files at once
 * @param {string[]} paths Array of relative paths
 */
const deleteFiles = (paths) => {
    if (!Array.isArray(paths)) return;
    paths.forEach(deleteFile);
};

module.exports = {
    deleteFile,
    deleteFiles
};
