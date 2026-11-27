import rateLimit from 'express-rate-limit';

/**
 * Sensitive authentication route rate limiter (prevents brute-force credential stuffing).
 * Window: 15 minutes, Max: 30 requests per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false, // Prevents ERR_ERL_PERMISSIVE_TRUST_PROXY on reverse proxies like Render
    xForwardedForHeader: false,
  },
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many authentication attempts from this IP. Please wait 15 minutes before trying again.',
  },
});

/**
 * General API rate limiter (protects against denial-of-service and scraping).
 * Window: 15 minutes, Max: 1,000 requests per IP (high limit to support active dashboard polling).
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false, // Prevents ERR_ERL_PERMISSIVE_TRUST_PROXY on reverse proxies like Render
    xForwardedForHeader: false,
  },
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
