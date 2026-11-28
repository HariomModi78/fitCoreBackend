import jwt from 'jsonwebtoken';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.js';

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw ApiError.unauthorized('Authentication token is required');
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fitcore_super_secret_jwt_access_key_2025'
    );

    const user = await User.findById(decodedToken.id).select('-password');
    if (!user) {
      throw ApiError.unauthorized('Invalid or expired authentication token');
    }

    const isAuthMe =
      req.originalUrl?.includes('/auth/me') ||
      req.baseUrl?.includes('/auth');

    if (user.status !== 'active' && !isAuthMe && !user.isSuperAdmin) {
      throw ApiError.forbidden('User account is inactive or suspended');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Invalid or expired token');
  }
});

export const verifySuperAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    throw ApiError.forbidden('Access denied. Superadmin privileges required.');
  }
  next();
});

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return next();
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fitcore_super_secret_jwt_access_key_2025'
    );

    const user = await User.findById(decodedToken.id).select('-password');
    if (user && (user.status === 'active' || user.isSuperAdmin)) {
      req.user = user;
    }
  } catch (error) {
    // Silently continue without authenticated user for optional auth
  }
  next();
});

export default verifyJWT;
