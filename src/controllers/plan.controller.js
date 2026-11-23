import MembershipPlan from '../models/MembershipPlan.js';
import Subscription from '../models/Subscription.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getPlans = asyncHandler(async (req, res) => {
  const plans = await MembershipPlan.find({
    gymId: req.gymId,
    status: { $ne: 'archived' },
  }).sort({ createdAt: -1 });

  // Dynamically compute enrollments from real subscriptions
  const plansWithRealCounts = await Promise.all(
    plans.map(async (plan) => {
      const enrollments = await Subscription.countDocuments({
        gymId: req.gymId,
        planId: plan._id,
      });
      return {
        ...plan.toObject(),
        enrollments,
      };
    })
  );

  const activePlansCount = plans.filter((p) => p.status === 'active').length;
  const totalEnrollments = plansWithRealCounts.reduce((sum, p) => sum + p.enrollments, 0);

  return ApiResponse.success(res, {
    plans: plansWithRealCounts,
    stats: {
      totalPlans: plans.length,
      activePlans: activePlansCount,
      totalEnrollments,
    },
  });
});

export const createPlan = asyncHandler(async (req, res) => {
  const { name, duration, durationUnit = 'months', price, description, features } = req.body;

  if (!name || !duration || price === undefined) {
    throw ApiError.badRequest('Plan name, duration, and price are required');
  }

  const existingPlan = await MembershipPlan.findOne({
    gymId: req.gymId,
    name: name.trim(),
    status: { $ne: 'archived' },
  });

  if (existingPlan) {
    throw ApiError.conflict('A plan with this name already exists in your gym');
  }

  const plan = await MembershipPlan.create({
    gymId: req.gymId,
    name: name.trim(),
    duration: parseInt(duration),
    durationUnit,
    price: parseFloat(price),
    description,
    features: Array.isArray(features) ? features : [],
    status: 'active',
  });

  return ApiResponse.created(res, plan, 'Membership plan created successfully');
});

export const updatePlan = asyncHandler(async (req, res) => {
  const { name, duration, durationUnit, price, description, features, status } = req.body;

  const plan = await MembershipPlan.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!plan) {
    throw ApiError.notFound('Plan not found');
  }

  if (name) plan.name = name.trim();
  if (duration !== undefined) plan.duration = parseInt(duration);
  if (durationUnit !== undefined) plan.durationUnit = durationUnit;
  if (price !== undefined) plan.price = parseFloat(price);
  if (description !== undefined) plan.description = description;
  if (features !== undefined) plan.features = features;
  if (status !== undefined) plan.status = status;

  await plan.save();

  return ApiResponse.success(res, plan, 'Membership plan updated successfully');
});

export const deletePlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!plan) {
    throw ApiError.notFound('Plan not found');
  }

  // Soft delete / archive to protect historical integrity
  plan.status = 'archived';
  await plan.save();

  return ApiResponse.success(res, null, 'Membership plan archived successfully');
});
