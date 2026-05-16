// Centralized Error Handling Middleware to ensure Zero Sensitive Data Leakage
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log full error internally for debugging
  console.error(`[Error Handler] ${req.method} ${req.originalUrl} -> ${err.message}`, err);

  // Structure sanitized response payload
  const errorResponse = {
    success: false,
    status: statusCode,
    message: isProduction && statusCode === 500 
      ? 'An internal system error occurred while processing your request.' 
      : err.message,
    ...( !isProduction ? { stack: err.stack } : {} )
  };

  res.status(statusCode).json(errorResponse);
};

// Async route handler wrapper to eliminate unhandled rejection crashes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler
};
