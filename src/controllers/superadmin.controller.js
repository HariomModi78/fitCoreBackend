import Gym from '../models/Gym.js';
import User from '../models/User.js';
import Member from '../models/Member.js';
import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';
import Subscription from '../models/Subscription.js';
import AuditLog from '../models/AuditLog.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// 1. Global Platform Metrics & KPI Overview
export const getPlatformStats = asyncHandler(async (req, res) => {
  const [
    totalGyms,
    activeGyms,
    trialGyms,
    suspendedGyms,
    totalMembers,
    activeMemberSubs,
    totalUsers,
    saasPlans,
  ] = await Promise.all([
    Gym.countDocuments(),
    Gym.countDocuments({ status: 'active' }),
    Gym.countDocuments({ status: 'trial' }),
    Gym.countDocuments({ status: 'suspended' }),
    Member.countDocuments(),
    Subscription.countDocuments({ status: 'active' }),
    User.countDocuments(),
    SaaSPlan.find(),
  ]);

  // Aggregate SaaS subscription health
  const activeSaaSSubs = await GymSaaSSubscription.find({
    status: { $in: ['active', 'trial'] },
  }).populate('planId');

  let estimatedMRR = 0;
  activeSaaSSubs.forEach((sub) => {
    if (sub.planId?.price) {
      // Normalize to monthly
      const months = sub.planId.durationUnit === 'years' ? (sub.planId.duration || 1) * 12 : (sub.planId.duration || 1);
      estimatedMRR += Math.round(sub.planId.price / (months || 1));
    }
  });

  // Recent 5 gyms with owner details
  const recentGyms = await Gym.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('ownerId', 'name email phone phoneVerified');

  return ApiResponse.success(
    res,
    {
      summary: {
        totalGyms,
        activeGyms,
        trialGyms,
        suspendedGyms,
        totalMembers,
        activeMemberSubs,
        totalUsers,
        estimatedMRR,
      },
      recentGyms,
    },
    'Platform overview statistics retrieved successfully'
  );
});

// 2. Searchable, paginated gym tenants
export const getAllGyms = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
      { slug: { $regex: s, $options: 'i' } },
    ];
  }

  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const [total, gyms] = await Promise.all([
    Gym.countDocuments(query),
    Gym.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .populate('ownerId', 'name email phone phoneVerified lastLogin')
      .lean(),
  ]);

  // Attach member counts and current SaaS subscription to each gym
  const gymIds = gyms.map((g) => g._id);
  const [memberCounts, saasSubs] = await Promise.all([
    Member.aggregate([
      { $match: { gymId: { $in: gymIds } } },
      { $group: { _id: '$gymId', count: { $sum: 1 } } },
    ]),
    GymSaaSSubscription.find({ gymId: { $in: gymIds } })
      .sort({ createdAt: -1 })
      .populate('planId'),
  ]);

  const countMap = {};
  memberCounts.forEach((c) => {
    countMap[c._id.toString()] = c.count;
  });

  const subMap = {};
  saasSubs.forEach((sub) => {
    if (!subMap[sub.gymId.toString()]) {
      subMap[sub.gymId.toString()] = sub;
    }
  });

  const enrichedGyms = gyms.map((gym) => ({
    ...gym,
    memberCount: countMap[gym._id.toString()] || 0,
    subscription: subMap[gym._id.toString()] || null,
  }));

  return ApiResponse.success(
    res,
    {
      gyms: enrichedGyms,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    },
    'Gym tenants retrieved successfully'
  );
});

// 3. Update gym tenant status or extend trial
export const updateGymStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, extendDays } = req.body;

  const gym = await Gym.findById(id);
  if (!gym) {
    throw ApiError.notFound('Gym not found');
  }

  if (status && ['active', 'trial', 'suspended', 'inactive'].includes(status)) {
    gym.status = status;
  }

  // If extending trial or active period
  if (extendDays && parseInt(extendDays, 10) > 0) {
    const daysToAdd = parseInt(extendDays, 10);
    const sub = await GymSaaSSubscription.findOne({ gymId: gym._id }).sort({ createdAt: -1 });
    if (sub) {
      const currentEnd = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()
        ? new Date(sub.currentPeriodEnd)
        : new Date();
      sub.currentPeriodEnd = new Date(currentEnd.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      if (gym.status === 'suspended') gym.status = 'active';
      await sub.save();
    }
  }

  await gym.save();

  return ApiResponse.success(res, gym, 'Gym tenant updated successfully');
});

// 4. Platform Users List
export const getPlatformUsers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 25 } = req.query;

  const query = {};
  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
    ];
  }

  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
  ]);

  return ApiResponse.success(
    res,
    {
      users,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    },
    'Platform users retrieved successfully'
  );
});

// 5. Platform Audit Logs
export const getPlatformAuditLogs = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const l = Math.max(1, Math.min(200, parseInt(limit, 10)));

  const logs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(l)
    .populate('gymId', 'name slug')
    .populate('userId', 'name email')
    .lean();

  return ApiResponse.success(res, logs, 'Audit logs retrieved successfully');
});
