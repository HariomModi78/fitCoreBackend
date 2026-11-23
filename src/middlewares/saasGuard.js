import Gym from '../models/Gym.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const requireActiveSaaS = asyncHandler(async (req, res, next) => {
  // Superadmin bypasses gym saas paywall
  if (req.user?.isSuperAdmin) {
    return next();
  }

  const gymId = req.gymId;
  if (!gymId) return next();

  const gym = await Gym.findById(gymId);
  if (!gym) return next();

  const now = new Date();
  const expiresAt = gym.saasExpiresAt ? new Date(gym.saasExpiresAt) : null;
  const isExpired = !expiresAt || now > expiresAt;

  if (isExpired) {
    if (gym.saasStatus !== 'expired') {
      gym.saasStatus = 'expired';
      await gym.save();
    }

    return ApiResponse.paymentRequired(
      res,
      'Your FitCore subscription has expired. Please renew your plan to continue accessing your gym dashboard and member services.',
      {
        gymId: gym._id,
        saasStatus: 'expired',
        saasExpiresAt: gym.saasExpiresAt,
      }
    );
  }

  req.gym = gym;
  next();
});

export default requireActiveSaaS;
