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
import { sanitizeInputs } from './middlewares/sanitize.js';
import { apiLimiter } from './middlewares/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();

// Trust reverse proxy: On Render/Railway/Heroku, trust 1 hop (the reverse proxy)
// This secures IP extraction and fixes express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY
app.set('trust proxy', 1);

// Security Middlewares: Content Security Policy & Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://checkout.razorpay.com',
        ],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          process.env.CLIENT_URL || '',
        ].filter(Boolean),
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Strict Origin Validation for Cross-Origin Resource Sharing (CORS)
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In non-production environments, allow local development ports
      if (process.env.NODE_ENV !== 'production') {
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('http://127.0.0.1') ||
          allowedOrigins.includes(origin)
        ) {
          return callback(null, true);
        }
      }

      // In production, strictly match configured allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Blocked by CORS: Origin ${origin} is not authorized`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Gym-Id'],
  })
);

// Logging: compact dev format in development, standard request log in production for monitoring
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
}

// Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// NoSQL Injection Sanitizer (strips malicious $ and . operators)
app.use(sanitizeInputs);

// API Rate Limiter (protects against DoS / scraping)
app.use('/api', apiLimiter);
app.use('/api/v1', apiLimiter);

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
