import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import errorHandler from './middlewares/errorHandler.js';
import ApiError from './utils/apiError.js';
import ApiResponse from './utils/apiResponse.js';
import apiRouter from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();

// Trust reverse proxy (Render, Railway, Nginx, Cloudflare) for secure cookies & client IP
app.enable('trust proxy');

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows flexible loading in dev and production
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost on any port (5173, 5174, etc.) or no origin (mobile/curl/same-origin)
      if (
        !origin ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in full-stack self-hosted environments
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Gym-Id'],
  })
);

// Logging: compact dev format in development, standard request log in production for Render monitoring
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
}

// Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Base Health Check Routes
app.get(['/', '/health', '/api/v1/health'], (req, res) => {
  return ApiResponse.success(
    res,
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'FitCore Multi-tenant SaaS API',
      version: '1.0.0',
    },
    'FitCore API is running smoothly'
  );
});

// Mount All API Routes under /api/v1 as well as direct paths (/auth, /members, etc.)
// This guarantees that whether the frontend calls /api/v1/auth/login or /auth/login, it works seamlessly!
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);
app.use(apiRouter);

// Serve built frontend static assets in production (if frontend was bundled with backend)
app.use(express.static(clientDistPath));

// For any non-API route, serve client index.html (SPA fallback)
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next(ApiError.notFound(`API route not found: ${req.originalUrl}`));
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      return res.status(200).json({
        success: true,
        message: 'FitCore API Server is running.',
        apiBase: '/api/v1',
        healthCheck: '/api/v1/health',
      });
    }
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
