/**
 * Standard utility for sending uniform API responses
 */
const response = {
  success: (res, message, data = null, statusCode = 200) => {
    return res.status(statusCode).json({
      status: 'success',
      message,
      data
    });
  },

  error: (res, message, errorCode = 'INTERNAL_ERROR', statusCode = 500, details = null) => {
    return res.status(statusCode).json({
      status: 'error',
      message,
      errorCode,
      details
    });
  }
};

module.exports = response;
