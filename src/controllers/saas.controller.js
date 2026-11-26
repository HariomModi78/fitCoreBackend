import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';
import Gym from '../models/Gym.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
} from '../utils/razorpayService.js';
import {
  dispatchWhatsAppMessage,
  generateWhatsAppUrl,
} from '../utils/whatsappService.js';

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
  const plans = await SaaSPlan.find(query).sort({ sortOrder: 1, price: 1 });

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

  const isValid = await verifyRazorpayPayment({
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

  try {
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
  } catch (auditErr) {
    console.warn('[SaaS AuditLog Warning]:', auditErr.message);
  }

  // 1. Prepare WhatsApp congratulations message with plan details and expiry
  const targetPhone = gym.phone || req.user?.phone || '';
  const expiryFormatted = newEndDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const whatsappMessage = `🎉 *Congratulations from FitCore!*

Hi *${gym.name}*, your FitCore Gym Management SaaS subscription has been successfully activated! 🚀

📋 *Subscription Details:*
• Plan: *${plan.name}*
• Duration: *${plan.duration} ${plan.durationUnit}*
• Amount Paid: *₹${Number(plan.price).toLocaleString('en-IN')}*
• Payment Gateway: *Razorpay* (${razorpayPaymentId || 'Verified'})
• Valid Until: *${expiryFormatted}*

✨ All core features—including member registrations, payment & expense management, automated WhatsApp renewal alerts, and business reports—are active.

Thank you for choosing FitCore. Stronger Together!
📞 Support: support@fitcore.app | fitcore.app`;

  // 2. Dispatch WhatsApp message to gym's phone number
  let whatsappResult = null;
  const whatsappUrl = targetPhone ? generateWhatsAppUrl(targetPhone, whatsappMessage) : null;

  if (targetPhone) {
    try {
      whatsappResult = await dispatchWhatsAppMessage({
        phone: targetPhone,
        text: whatsappMessage,
      });
      console.log(`[SaaS Purchase]: WhatsApp confirmation dispatched to ${targetPhone} (via: ${whatsappResult?.via})`);
    } catch (waErr) {
      console.warn('[SaaS WhatsApp Dispatch Warning]:', waErr.message);
    }
  }

  // 3. Create In-App Notification Record for Gym
  let notificationRecord = null;
  try {
    notificationRecord = await Notification.create({
      gymId: gym._id,
      type: 'subscription_renewed',
      title: `🎉 FitCore Subscription Activated: ${plan.name}`,
      message: whatsappMessage,
      recipientPhone: targetPhone,
      whatsappUrl,
      whatsappStatus: {
        sent: whatsappResult?.success || false,
        sentAt: whatsappResult?.success ? new Date() : null,
        messageId: whatsappResult?.messageId || null,
        deliveryStatus: whatsappResult?.success ? 'sent' : 'pending',
        error: whatsappResult?.error || null,
      },
      isRead: false,
    });
  } catch (notifErr) {
    console.warn('[SaaS Notification Record Warning]:', notifErr.message);
  }

  return ApiResponse.success(
    res,
    {
      gym,
      subscription,
      notification: notificationRecord,
      whatsappUrl,
      whatsappResult,
      targetPhone,
    },
    `Congratulations! Your FitCore subscription is active until ${expiryFormatted}. Confirmation notification sent to ${targetPhone || 'your gym'}.`
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
