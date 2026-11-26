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

export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin || req.gymRole === 'owner') return next();
    if (!req.permissions || !permissions.some((p) => req.permissions.includes(p))) {
      throw ApiError.forbidden(`Missing required permission: ${permissions.join(' or ')}`);
    }
    next();
  };
};

export default { requireRole, requirePermission };
