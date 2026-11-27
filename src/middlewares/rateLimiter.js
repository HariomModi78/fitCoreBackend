import rateLimit from 'express-rate-limit';

/**
 * Sensitive authentication route rate limiter (prevents brute-force credential stuffing).
 * Window: 15 minutes, Max: 20 requests per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many authentication attempts from this IP. Please wait 15 minutes before trying again.',
  },
});

/**
 * General API rate limiter (protects against denial-of-service and scraping).
 * Window: 15 minutes, Max: 300 requests per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests from this network. Please slow down and try again shortly.',
  },
  skip: (req) => {
    // Skip health checks, root status, and static assets
    return (
      req.path === '/' ||
      req.path === '/health' ||
      req.path === '/api/v1/health' ||
      !req.path.startsWith('/api')
    );
  },
});

export default {
  authLimiter,
  apiLimiter,
};
