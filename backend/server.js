const express = require('express');
const dotenv = require('dotenv');
const { testConnection } = require('./config/db');
const { helmetMiddleware, corsMiddleware, globalRateLimiter } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const societyRoutes = require('./routes/societies');

// Load secure environment configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Mount Zero-Breach Security & Parsing Middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(globalRateLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint for Load Balancers & Monitoring
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routing Endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/societies', societyRoutes);

// Catch-All 404 Route
app.use('*', (req, res) => {
  res.status(404).json({ success: false, status: 404, message: 'Requested API endpoint resource not found.' });
});

// Global Centralized Error Handling Middleware
app.use(errorHandler);

// Asynchronously Verify Database Connection & Boot Application Server
const startServer = async () => {
  console.log(`[Boot Sequence] Initializing Propert-Ease backend server in ${process.env.NODE_ENV || 'development'} mode...`);
  await testConnection();
  
  const server = app.listen(PORT, () => {
    console.log(`[Server] Propert-Ease backend API successfully operational on port ${PORT}`);
    console.log(`[Server] Health Check available at http://localhost:${PORT}/api/health`);
  });

  // Graceful Shutdown Handlers for zero downtime deployments
  const shutdown = (signal) => {
    console.log(`[Shutdown Sequence] Received ${signal}. Gracefully terminating HTTP server...`);
    server.close(() => {
      console.log('[Shutdown Sequence] HTTP server successfully closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
