import Gym from '../models/Gym.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Member from '../models/Member.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { validateTemplatePlaceholders } from '../utils/whatsappService.js';

export const getGymProfile = asyncHandler(async (req, res) => {
  const gym = await Gym.findById(req.gymId);
  return ApiResponse.success(res, gym);
});

export const updateGymProfile = asyncHandler(async (req, res) => {
  const { name, phone, email, address, currency, timezone, settings } = req.body;
  const gym = await Gym.findById(req.gymId);

  if (name) gym.name = name.trim();
  if (phone) gym.phone = phone.trim();
  if (email) gym.email = email.toLowerCase().trim();
  if (address) gym.address = address;
  if (currency) gym.currency = currency;
  if (timezone) gym.timezone = timezone;

  if (settings) {
    if (!gym.settings) gym.settings = {};
    if (settings.acceptedPaymentMethods) {
      gym.settings.acceptedPaymentMethods = settings.acceptedPaymentMethods;
    }
    if (settings.expiryReminderDays) {
      gym.settings.expiryReminderDays = settings.expiryReminderDays
        .map((d) => Number(d))
        .filter((d) => !isNaN(d) && d >= 0)
        .sort((a, b) => b - a);
    }
    if (settings.whatsappSettings) {
      if (settings.whatsappSettings.customTemplateBefore) {
        const v = validateTemplatePlaceholders(settings.whatsappSettings.customTemplateBefore);
        if (!v.valid) {
          return ApiResponse.badRequest(res, `Before-expiry template error: ${v.error}`);
        }
      }
      if (settings.whatsappSettings.customTemplateOnExpiry) {
        const v = validateTemplatePlaceholders(settings.whatsappSettings.customTemplateOnExpiry);
        if (!v.valid) {
          return ApiResponse.badRequest(res, `On-expiry template error: ${v.error}`);
        }
      }

      gym.settings.whatsappSettings = {
        ...gym.settings.whatsappSettings,
        ...settings.whatsappSettings,
      };
    }
    if (settings.memberCodePrefix) {
      gym.settings.memberCodePrefix = settings.memberCodePrefix.toUpperCase().trim();
    }
    gym.markModified('settings');
  }

  await gym.save();

  return ApiResponse.success(res, gym, 'Gym settings updated successfully');
});

export const completeOnboarding = asyncHandler(async (req, res) => {
  const { gymDetails, plans, acceptedPaymentMethods, firstMember } = req.body;
  const gym = await Gym.findById(req.gymId);

  if (gymDetails) {
    if (gymDetails.name) gym.name = gymDetails.name.trim();
    if (gymDetails.phone && gymDetails.phone !== '0000000000') {
      gym.phone = gymDetails.phone.trim();
    } else if ((!gym.phone || gym.phone === '0000000000') && req.user?.phone) {
      gym.phone = req.user.phone;
    }

    if (gymDetails.email) {
      gym.email = gymDetails.email.toLowerCase().trim();
    } else if (!gym.email && req.user?.email) {
      gym.email = req.user.email.toLowerCase().trim();
    }

    if (gymDetails.currency) gym.currency = gymDetails.currency;
    if (gymDetails.timezone) gym.timezone = gymDetails.timezone;
    if (gymDetails.address) gym.address = gymDetails.address;
    if (gymDetails.memberCodePrefix) {
      gym.settings.memberCodePrefix = gymDetails.memberCodePrefix.toUpperCase();
    }
  }

  if (acceptedPaymentMethods) {
    gym.settings.acceptedPaymentMethods = acceptedPaymentMethods;
  }

  gym.onboardingCompleted = true;
  await gym.save();

  // 1. Create chosen initial membership plans
  const createdPlans = [];
  if (Array.isArray(plans) && plans.length > 0) {
    for (const plan of plans) {
      if (plan.name && plan.price !== undefined) {
        const newPlan = await MembershipPlan.create({
          gymId: gym._id,
          name: plan.name,
          duration: plan.duration || 1,
          durationUnit: plan.durationUnit || 'months',
          price: parseFloat(plan.price),
          description: plan.description || '',
          status: 'active',
        });
        createdPlans.push(newPlan);
      }
    }
  }

  // 2. Create first member if provided
  if (firstMember && firstMember.name && firstMember.phone) {
    const memberCode = `${gym.settings.memberCodePrefix || 'FG'}-0001`;
    gym.settings.nextMemberNumber = 2;
    await gym.save();

    const newMember = await Member.create({
      gymId: gym._id,
      memberCode,
      name: firstMember.name.trim(),
      phone: firstMember.phone.trim(),
      email: firstMember.email ? firstMember.email.toLowerCase().trim() : '',
      status: 'active',
      joiningDate: new Date(),
    });

    // If a plan was created, assign it to the first member
    if (createdPlans.length > 0) {
      const assignedPlan = createdPlans[0];
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + assignedPlan.duration);

      const sub = await Subscription.create({
        gymId: gym._id,
        memberId: newMember._id,
        planId: assignedPlan._id,
        planNameSnapshot: assignedPlan.name,
        durationSnapshot: assignedPlan.duration,
        durationUnitSnapshot: assignedPlan.durationUnit,
        originalPrice: assignedPlan.price,
        payableAmount: assignedPlan.price,
        amountPaid: assignedPlan.price,
        startDate: new Date(),
        endDate,
        status: 'active',
        paymentStatus: 'paid',
        createdBy: req.user._id,
      });

      newMember.currentSubscriptionId = sub._id;
      await newMember.save();

      // Record first payment
      await Payment.create({
        gymId: gym._id,
        memberId: newMember._id,
        subscriptionId: sub._id,
        receiptNumber: 'REC-00001',
        amount: assignedPlan.price,
        paymentMethod: 'cash',
        paymentDate: new Date(),
        recordedBy: req.user._id,
        recordedByName: req.user.name,
        notes: 'Initial fee during gym onboarding setup',
      });
    }
  }

  return ApiResponse.success(res, gym, 'Gym onboarding completed successfully');
});
