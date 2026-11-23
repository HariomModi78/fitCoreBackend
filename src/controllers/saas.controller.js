import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';
import Gym from '../models/Gym.js';
import AuditLog from '../models/AuditLog.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
} from '../utils/razorpayService.js';

// Helper to compute future date from duration & unit
export const computeFutureDate = (baseDate, duration, durationUnit) => {
  const date = new Date(baseDate);
  const dur = parseInt(duration, 10) || 1;
  const unit = (durationUnit || 'months').toLowerCase();

  if (unit.startsWith('day')) {
    date.setDate(date.getDate() + dur);
  } else if (unit.startsWith('year')) {
    date.setFullYear(date.getFullYear() + dur);
  } else {
    // months
    date.setMonth(date.getMonth() + dur);
  }
  return date;
};

// 1. Get SaaS Plans (for Gym Owners & Superadmins)
export const getSaaSPlans = asyncHandler(async (req, res) => {
  // Migrate / heal any legacy plans in MongoDB that lack 'price'
  await SaaSPlan.updateMany(
    { price: { $exists: false } },
    [
      {
        $set: {
          price: { $ifNull: ['$priceMonthly', 799] },
          duration: { $ifNull: ['$duration', 1] },
          durationUnit: { $ifNull: ['$durationUnit', 'months'] },
          isActive: true,
        },
      },
    ]
  );

  const query = req.user?.isSuperAdmin ? {} : { isActive: true };
  let plans = await SaaSPlan.find(query).sort({ sortOrder: 1, price: 1 });

  // If no plans exist yet, seed default standard plans automatically
  if (plans.length === 0) {
    const defaultPlans = [
      {
        name: 'Monthly License',
        duration: 1,
        durationUnit: 'months',
        price: 799,
        description: 'Monthly unlimited gym management with automated WhatsApp alerts',
        badge: 'Starter',
        sortOrder: 1,
      },
      {
        name: 'Quarterly Pro',
        duration: 3,
        durationUnit: 'months',
        price: 2199,
        description: '3 months full access. Save ~10% on quarterly billing',
        badge: 'Most Popular',
        sortOrder: 2,
      },
      {
        name: 'Annual Freedom',
        duration: 12,
        durationUnit: 'months',
        price: 6999,
        description: '1 full year uninterrupted automation. Best value for serious gym owners',
        badge: 'Best Value',
        sortOrder: 3,
      },
    ];

    plans = await SaaSPlan.insertMany(defaultPlans);
  }

  // Ensure all plans have a safe numeric price and duration
  const sanitizedPlans = plans.map((p) => {
    const obj = p.toObject ? p.toObject() : { ...p };
    obj.price = typeof obj.price === 'number' ? obj.price : (Number(obj.priceMonthly) || 799);
    obj.duration = obj.duration || 1;
    obj.durationUnit = obj.durationUnit || 'months';
    return obj;
  });

  return ApiResponse.success(res, sanitizedPlans);
});

// 2. Superadmin: Create New SaaS Plan
export const createSaaSPlan = asyncHandler(async (req, res) => {
  const {
    name,
    duration,
    durationUnit = 'months',
    price,
    description,
    features,
    badge,
    sortOrder = 0,
  } = req.body;

  if (!name || price === undefined || !duration) {
    throw ApiError.badRequest('Plan name, duration, and price are required.');
  }

  const plan = await SaaSPlan.create({
    name: name.trim(),
    duration: parseInt(duration, 10),
    durationUnit,
    price: parseFloat(price),
    description: description ? description.trim() : '',
    features: Array.isArray(features) && features.length > 0 ? features : undefined,
    badge: badge ? badge.trim() : '',
    sortOrder: parseInt(sortOrder, 10) || 0,
    isActive: true,
  });

  return ApiResponse.created(res, plan, 'SaaS subscription plan created successfully');
});

// 3. Superadmin: Update SaaS Plan
export const updateSaaSPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  const plan = await SaaSPlan.findByIdAndUpdate(id, updateData, { new: true });
  if (!plan) throw ApiError.notFound('Plan not found');

  return ApiResponse.success(res, plan, 'Plan updated successfully');
});

// 4. Superadmin: Delete / Deactivate SaaS Plan
export const deleteSaaSPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const plan = await SaaSPlan.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!plan) throw ApiError.notFound('Plan not found');

  return ApiResponse.success(res, plan, 'Plan deactivated successfully');
});

// 5. Gym Owner: Create Razorpay Order to Purchase Subscription
export const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const gymId = req.gymId;

  const plan = await SaaSPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw ApiError.notFound('Selected subscription plan is invalid or inactive');
  }

  const gym = await Gym.findById(gymId);
  if (!gym) throw ApiError.notFound('Gym not found');

  const receipt = `fitcore_gym_${gymId.toString().slice(-6)}_${Date.now()}`;

  const order = await createRazorpayOrder({
    amount: plan.price,
    receipt,
    notes: {
      gymId: gym._id.toString(),
      gymName: gym.name,
      planName: plan.name,
      duration: `${plan.duration} ${plan.durationUnit}`,
    },
  });

  return ApiResponse.success(res, {
    order,
    plan,
    gym: {
      name: gym.name,
      phone: gym.phone,
      email: gym.email,
    },
  });
});

// 6. Gym Owner: Verify Razorpay Payment and Activate Gym Subscription
export const verifyAndActivateSubscription = asyncHandler(async (req, res) => {
  const { planId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const gymId = req.gymId;

  const isValid = verifyRazorpayPayment({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!isValid) {
    throw ApiError.badRequest('Invalid payment signature verification failed');
  }

  const plan = await SaaSPlan.findById(planId);
  if (!plan) throw ApiError.notFound('Plan not found');

  const gym = await Gym.findById(gymId);
  if (!gym) throw ApiError.notFound('Gym not found');

  // Compute new expiration date: extend if currently valid, or start from today
  const now = new Date();
  const currentExpiry = gym.saasExpiresAt ? new Date(gym.saasExpiresAt) : null;
  const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newEndDate = computeFutureDate(baseDate, plan.duration, plan.durationUnit);

  // Update Gym
  gym.saasStatus = 'active';
  gym.saasExpiresAt = newEndDate;
  gym.saasPlanId = plan._id;
  await gym.save();

  // Record GymSaaSSubscription
  const subscription = await GymSaaSSubscription.create({
    gymId: gym._id,
    planId: plan._id,
    planNameSnapshot: plan.name,
    durationSnapshot: plan.duration,
    durationUnitSnapshot: plan.durationUnit,
    amount: plan.price,
    startDate: baseDate,
    endDate: newEndDate,
    paymentGateway: 'razorpay',
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    purchasedBy: req.user._id,
    status: 'active',
  });

  await AuditLog.create({
    gymId: gym._id,
    userId: req.user._id,
    action: 'SAAS_SUBSCRIPTION_PURCHASE',
    details: {
      planName: plan.name,
      amount: plan.price,
      newExpiresAt: newEndDate,
      paymentId: razorpayPaymentId,
    },
  });

  return ApiResponse.success(
    res,
    {
      gym,
      subscription,
    },
    `Congratulations! Your FitCore subscription is active until ${newEndDate.toLocaleDateString()}.`
  );
});

// 7. Get Current Gym's SaaS Status
export const getGymSaaSStatus = asyncHandler(async (req, res) => {
  const gym = await Gym.findById(req.gymId).populate('saasPlanId');
  if (!gym) throw ApiError.notFound('Gym not found');

  const now = new Date();
  const expiresAt = gym.saasExpiresAt ? new Date(gym.saasExpiresAt) : null;
  const isExpired = !expiresAt || now > expiresAt;

  let daysLeft = 0;
  if (expiresAt && !isExpired) {
    daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return ApiResponse.success(res, {
    gymId: gym._id,
    gymName: gym.name,
    saasStatus: isExpired ? 'expired' : gym.saasStatus || 'active',
    saasExpiresAt: gym.saasExpiresAt,
    trialEndsAt: gym.trialEndsAt,
    isExpired,
    daysLeft,
    activePlan: gym.saasPlanId,
  });
});
