import ApiError from '../utils/apiError.js';

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next();
    if (!req.gymRole || !roles.includes(req.gymRole)) {
      throw ApiError.forbidden(`Requires one of following roles: ${roles.join(', ')}`);
    }
    next();
  };
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin || req.gymRole === 'owner') return next();
    if (!req.permissions || !req.permissions.includes(permission)) {
      throw ApiError.forbidden(`Missing required permission: ${permission}`);
    }
    next();
  };
};

export default { requireRole, requirePermission };
