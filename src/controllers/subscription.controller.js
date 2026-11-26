import Subscription from '../models/Subscription.js';
import Member from '../models/Member.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Payment from '../models/Payment.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import Gym from '../models/Gym.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateWhatsAppUrl } from '../utils/whatsappService.js';

// Helper to compute end date based on duration & unit
const computeEndDate = (startDate, duration, durationUnit) => {
  const end = new Date(startDate);
  if (durationUnit === 'days') {
    end.setDate(end.getDate() + duration);
  } else if (durationUnit === 'weeks') {
    end.setDate(end.getDate() + duration * 7);
  } else if (durationUnit === 'years') {
    end.setFullYear(end.getFullYear() + duration);
  } else {
    // Default months
    end.setMonth(end.getMonth() + duration);
  }
  return end;
};

export const createSubscription = asyncHandler(async (req, res) => {
  const {
    memberId,
    planId,
    startDate = new Date(),
    discountAmount = 0,
    discountReason,
    amountPaid = 0,
    paymentMethod = 'cash',
    transactionReference,
    dueReminderDays,
    dueReminderNotes,
    notes,
  } = req.body;

  if (!memberId || !planId) {
    throw ApiError.badRequest('Member and membership plan are required');
  }

  const member = await Member.findOne({ _id: memberId, gymId: req.gymId });
  if (!member) throw ApiError.notFound('Member not found');

  const plan = await MembershipPlan.findOne({ _id: planId, gymId: req.gymId });
  if (!plan) throw ApiError.notFound('Membership plan not found');

  const parsedStart = new Date(startDate);
  const parsedEnd = computeEndDate(parsedStart, plan.duration, plan.durationUnit);

  const originalPrice = plan.price;
  const discount = Math.min(originalPrice, Math.max(0, parseFloat(discountAmount) || 0));
  const payableAmount = Math.max(0, originalPrice - discount);
  const initialPayment = Math.max(0, parseFloat(amountPaid) || 0);

  let paymentStatus = 'unpaid';
  if (initialPayment > payableAmount) {
    paymentStatus = 'overpaid';
  } else if (initialPayment >= payableAmount && payableAmount > 0) {
    paymentStatus = 'paid';
  } else if (initialPayment > 0) {
    paymentStatus = 'partially_paid';
  }

  const now = new Date();
  let subStatus = 'active';
  if (parsedStart > now) {
    subStatus = 'upcoming';
  } else if (parsedEnd < now) {
    subStatus = 'expired';
  }

  // Create Subscription with historical snapshots
  const subscription = await Subscription.create({
    gymId: req.gymId,
    memberId: member._id,
    planId: plan._id,
    planNameSnapshot: plan.name,
    durationSnapshot: plan.duration,
    durationUnitSnapshot: plan.durationUnit,
    originalPrice,
    discountAmount: discount,
    discountReason,
    payableAmount,
    amountPaid: initialPayment,
    dueAmount: payableAmount - initialPayment,
    startDate: parsedStart,
    endDate: parsedEnd,
    status: subStatus,
    paymentStatus,
    notes,
    createdBy: req.user._id,
  });

  // If payment was provided, record Payment record with unique receipt
  let paymentRecord = null;
  if (initialPayment > 0) {
    const paymentCount = await Payment.countDocuments({ gymId: req.gymId });
    const receiptNumber = `REC-${String(paymentCount + 1).padStart(5, '0')}`;

    paymentRecord = await Payment.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: subscription._id,
      receiptNumber,
      amount: initialPayment,
      amountPaidSnapshot: initialPayment,
      remainingBalanceSnapshot: (payableAmount || 0) - initialPayment,
      paymentMethod,
      transactionReference,
      paymentDate: new Date(),
      recordedBy: req.user._id,
      recordedByName: req.user.name,
      notes: `Initial fee for ${plan.name}`,
    });
  }

  // If there's an outstanding due balance and a reminder was scheduled
  const pendingDue = Math.max(0, payableAmount - initialPayment);

  // Update member's current subscription, status & cached dueAmount (Hybrid Pattern)
  member.currentSubscriptionId = subscription._id;
  member.status = subStatus;
  member.dueAmount = pendingDue;
  await member.save();
  const parsedDueDays = parseInt(dueReminderDays, 10);
  if (pendingDue > 0 && !isNaN(parsedDueDays) && parsedDueDays > 0) {
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parsedDueDays);
    reminderDate.setHours(0, 0, 0, 0);

    subscription.dueReminderDays = parsedDueDays;
    subscription.dueReminderDate = reminderDate;
    subscription.dueReminderNotes = dueReminderNotes || `Promised in ${parsedDueDays} days`;
    await subscription.save();

    const gym = await Gym.findById(req.gymId);
    const dueMessage = `Hi ${member.name}, gentle reminder from ${gym?.name || 'your gym'}. You have a pending due of ₹${pendingDue.toLocaleString()} for your ${plan.name} membership. Promised date: ${reminderDate.toLocaleDateString()}. Contact: ${gym?.phone || ''}.`;
    const whatsappUrl = member.phone ? generateWhatsAppUrl(member.phone, dueMessage) : '';

    await Notification.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: subscription._id,
      type: 'due_reminder',
      title: `💰 Pending Due Reminder: ${member.name} (₹${pendingDue})`,
      message: dueMessage,
      daysLeft: parsedDueDays,
      recipientPhone: member.phone,
      whatsappUrl,
    });
  }

  // Audit log
  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'SUBSCRIPTION_CREATE',
    details: {
      memberId: member._id,
      subscriptionId: subscription._id,
      planName: plan.name,
      payableAmount,
      initialPayment,
    },
  });

  return ApiResponse.created(
    res,
    { subscription, payment: paymentRecord },
    'Subscription assigned successfully'
  );
});

export const renewSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params; // Member ID or Subscription ID
  const {
    planId,
    renewalStartDate,
    discountAmount = 0,
    discountReason,
    amountPaid = 0,
    paymentMethod = 'cash',
    transactionReference,
    dueReminderDays,
    dueReminderNotes,
  } = req.body;

  const member = await Member.findOne({ _id: id, gymId: req.gymId }).populate(
    'currentSubscriptionId'
  );
  if (!member) throw ApiError.notFound('Member not found');

  const plan = await MembershipPlan.findOne({ _id: planId, gymId: req.gymId });
  if (!plan) throw ApiError.notFound('Plan not found');

  // Determine renewal start date: if current subscription is still active and ends in future, start from current end date!
  let start = new Date();
  if (renewalStartDate) {
    start = new Date(renewalStartDate);
  } else if (
    member.currentSubscriptionId &&
    member.currentSubscriptionId.status === 'active' &&
    new Date(member.currentSubscriptionId.endDate) > new Date()
  ) {
    start = new Date(member.currentSubscriptionId.endDate);
  }

  const end = computeEndDate(start, plan.duration, plan.durationUnit);

  const originalPrice = plan.price;
  const discount = Math.min(originalPrice, Math.max(0, parseFloat(discountAmount) || 0));
  const payableAmount = Math.max(0, originalPrice - discount);
  const paymentAmount = Math.max(0, parseFloat(amountPaid) || 0);

  let paymentStatus = 'unpaid';
  if (paymentAmount > payableAmount) {
    paymentStatus = 'overpaid'; // Advance payment
  } else if (paymentAmount >= payableAmount && payableAmount > 0) {
    paymentStatus = 'paid';
  } else if (paymentAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  const newSubscription = await Subscription.create({
    gymId: req.gymId,
    memberId: member._id,
    planId: plan._id,
    planNameSnapshot: plan.name,
    durationSnapshot: plan.duration,
    durationUnitSnapshot: plan.durationUnit,
    originalPrice,
    discountAmount: discount,
    discountReason,
    payableAmount,
    amountPaid: paymentAmount,
    dueAmount: payableAmount - paymentAmount,
    startDate: start,
    endDate: end,
    status: 'active',
    paymentStatus,
    createdBy: req.user._id,
  });

  let paymentRecord = null;
  if (paymentAmount > 0) {
    const paymentCount = await Payment.countDocuments({ gymId: req.gymId });
    const receiptNumber = `REC-${String(paymentCount + 1).padStart(5, '0')}`;

    paymentRecord = await Payment.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: newSubscription._id,
      receiptNumber,
      amount: paymentAmount,
      amountPaidSnapshot: paymentAmount,
      remainingBalanceSnapshot: (payableAmount || 0) - paymentAmount,
      paymentMethod,
      transactionReference,
      paymentDate: new Date(),
      recordedBy: req.user._id,
      recordedByName: req.user.name,
      notes: `Renewal for ${plan.name}`,
    });
  }

  // If there's an outstanding balance and owner scheduled a reminder
  const pendingDue = Math.max(0, payableAmount - paymentAmount);

  // Update member's current subscription, status & cached dueAmount (Hybrid Pattern)
  member.currentSubscriptionId = newSubscription._id;
  member.status = 'active';
  member.dueAmount = pendingDue;
  await member.save();
  const parsedDueDays = parseInt(dueReminderDays, 10);
  if (pendingDue > 0 && !isNaN(parsedDueDays) && parsedDueDays > 0) {
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parsedDueDays);
    reminderDate.setHours(0, 0, 0, 0);

    newSubscription.dueReminderDays = parsedDueDays;
    newSubscription.dueReminderDate = reminderDate;
    newSubscription.dueReminderNotes = dueReminderNotes || `Promised in ${parsedDueDays} days`;
    await newSubscription.save();

    const gym = await Gym.findById(req.gymId);
    const dueMessage = `Hi ${member.name}, gentle reminder from ${gym?.name || 'your gym'}. You have a pending due of ₹${pendingDue.toLocaleString()} for your ${plan.name} renewal. Promised date: ${reminderDate.toLocaleDateString()}. Contact: ${gym?.phone || ''}.`;
    const whatsappUrl = member.phone ? generateWhatsAppUrl(member.phone, dueMessage) : '';

    await Notification.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: newSubscription._id,
      type: 'due_reminder',
      title: `💰 Pending Due Reminder: ${member.name} (₹${pendingDue})`,
      message: dueMessage,
      daysLeft: parsedDueDays,
      recipientPhone: member.phone,
      whatsappUrl,
    });
  }

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'SUBSCRIPTION_RENEW',
    details: {
      memberId: member._id,
      subscriptionId: newSubscription._id,
      planName: plan.name,
      amountPaid: paymentAmount,
    },
  });

  return ApiResponse.created(
    res,
    { subscription: newSubscription, payment: paymentRecord },
    'Membership renewed successfully'
  );
});

export const getSubscriptions = asyncHandler(async (req, res) => {
  const { memberId, status } = req.query;
  const query = { gymId: req.gymId };

  if (memberId) query.memberId = memberId;
  if (status) query.status = status;

  const subscriptions = await Subscription.find(query)
    .populate('memberId', 'name memberCode phone email')
    .sort({ createdAt: -1 });

  return ApiResponse.success(res, subscriptions);
});
