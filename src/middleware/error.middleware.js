const response = require('../utils/response');

/**
 * Global error handling middleware
 */
const errorMiddleware = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err.stack);

  // Default error values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errorCode = 'ERR_INTERNAL';

  // Handle specific Prisma errors, JWT errors, etc. here
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
    errorCode = 'ERR_VALIDATION';
  }

  return response.error(res, message, errorCode, statusCode, process.env.NODE_ENV === 'development' ? err.stack : null);
};

module.exports = errorMiddleware;
