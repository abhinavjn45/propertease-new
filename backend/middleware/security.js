const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// 1. Helmet HTTP Security Headers
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "http://localhost:3000"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

// 2. Strict CORS Configuration
const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      'http://localhost',
      'http://127.0.0.1',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://localhost:8080',
      'http://127.0.0.1:5001',
      'http://localhost:5001',
      'http://127.0.0.1:5501',
      'http://localhost:5501'
    ];
    // Allow requests with no origin (like mobile apps, file:// protocol, or curl)
    if (!origin || origin === 'null' || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Cross-Origin Request Blocked by CORS Security Policy.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// 3. API Rate Limiting to prevent Brute Force & DDoS attacks
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 100, // Limit each IP to 100 requests per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    success: false,
    message: 'Too many requests originating from this IP address. Please try again after 15 minutes.'
  }
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 15, // Limit each IP to 15 login/register attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    success: false,
    message: 'Exceeded authentication request quota. Please wait 15 minutes before attempting again.'
  }
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  globalRateLimiter,
  authRateLimiter
};
