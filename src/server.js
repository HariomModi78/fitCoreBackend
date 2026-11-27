import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';
import { initNightlyScheduler } from './services/nightlyScheduler.js';

const PORT = process.env.PORT || 5000;

// Security audit check on startup
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fitcore_super_secret_jwt_access_key_2025') {
    console.warn('\x1b[33m%s\x1b[0m', '[SECURITY WARNING]: Default JWT_SECRET detected in production! Please set a unique, cryptographically random JWT_SECRET in your environment variables.');
  }
}

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start background nightly scheduler (runs every night at 02:00 AM when server is idle)
    initNightlyScheduler(2, 0);

    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`FitCore SaaS Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`===============================================`);
    });

    const shutdown = () => {
      console.log('Received kill signal, shutting down gracefully...');
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
