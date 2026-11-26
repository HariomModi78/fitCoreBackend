import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import Gym from '../models/Gym.js';
import GymMembership from '../models/GymMembership.js';

export const requireTenant = asyncHandler(async (req, res, next) => {
  // Try X-Gym-Id header, then query, then body
  let targetGymId =
    req.header('X-Gym-Id') ||
    req.query.gymId ||
    req.body.gymId;

  // If no explicit gymId is provided or if target gym doesn't belong to user, find the user's active gym membership
  let membership = null;
  if (targetGymId) {
    membership = await GymMembership.findOne({
      userId: req.user._id,
      gymId: targetGymId,
      status: 'active',
    });
  }

  if (!membership) {
    membership = await GymMembership.findOne({
      userId: req.user._id,
      status: 'active',
    });
  }

  if (!membership) {
    // If super admin, allow bypassing tenant check only for super-admin platform endpoints
    if (req.user.isSuperAdmin && targetGymId) {
      const gym = await Gym.findById(targetGymId);
      if (gym) {
        req.gymId = gym._id;
        req.gym = gym;
        req.gymRole = 'owner';
        req.permissions = ['*'];
        return next();
      }
    }
    throw ApiError.forbidden('Tenant authorization failed: No active membership for this gym');
  }

  const gym = await Gym.findById(membership.gymId);
  if (!gym || gym.status === 'suspended') {
    throw ApiError.forbidden('Gym workspace is inaccessible or suspended');
  }

  req.gymId = gym._id;
  req.gym = gym;
  req.gymMembership = membership;
  req.gymRole = membership.role;
  req.permissions = membership.permissions || [];

  next();
});

export default requireTenant;
