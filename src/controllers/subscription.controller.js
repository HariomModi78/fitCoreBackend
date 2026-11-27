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

  // 1. Fetch member and membership plan concurrently (cuts query latency in half)
  const [member, plan] = await Promise.all([
    Member.findOne({ _id: memberId, gymId: req.gymId }),
    MembershipPlan.findOne({ _id: planId, gymId: req.gymId }),
  ]);

  if (!member) throw ApiError.notFound('Member not found');
  if (!plan) throw ApiError.notFound('Membership plan not found');

  const parsedStart = new Date(startDate);
  const parsedEnd = computeEndDate(parsedStart, plan.duration, plan.durationUnit);

  const originalPrice = plan.price;
  const discount = Math.min(originalPrice, Math.max(0, parseFloat(discountAmount) || 0));
  const payableAmount = Math.max(0, originalPrice - discount);
  const initialPayment = Math.max(0, parseFloat(amountPaid) || 0);
  const pendingDue = Math.max(0, payableAmount - initialPayment);

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

  // 2. Pre-compute reminder fields upfront to avoid a redundant second database write
  const parsedDueDays = parseInt(dueReminderDays, 10);
  const hasDueReminder = pendingDue > 0 && !isNaN(parsedDueDays) && parsedDueDays > 0;
  let reminderDate = null;
  let reminderNotes = '';

  if (hasDueReminder) {
    reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parsedDueDays);
    reminderDate.setHours(0, 0, 0, 0);
    reminderNotes = dueReminderNotes || `Promised in ${parsedDueDays} days`;
  }

  // 3. Create Subscription with complete snapshots in a single write
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
    dueAmount: pendingDue,
    startDate: parsedStart,
    endDate: parsedEnd,
    status: subStatus,
    paymentStatus,
    notes,
    dueReminderDays: hasDueReminder ? parsedDueDays : null,
    dueReminderDate: reminderDate,
    dueReminderNotes: reminderNotes,
    createdBy: req.user._id,
  });

  // 4. Record Payment if initial payment was provided (fast single-record index lookup)
  let paymentRecord = null;
  if (initialPayment > 0) {
    const lastPayment = await Payment.findOne({ gymId: req.gymId })
      .sort({ createdAt: -1 })
      .select('receiptNumber')
      .lean();

    let nextNumber = 1;
    if (lastPayment?.receiptNumber) {
      const match = lastPayment.receiptNumber.match(/(\d+)/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const receiptNumber = `REC-${String(nextNumber).padStart(5, '0')}`;

    paymentRecord = await Payment.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: subscription._id,
      receiptNumber,
      amount: initialPayment,
      amountPaidSnapshot: initialPayment,
      remainingBalanceSnapshot: pendingDue,
      paymentMethod,
      transactionReference,
      paymentDate: new Date(),
      recordedBy: req.user._id,
      recordedByName: req.user.name,
      notes: `Initial fee for ${plan.name}`,
    });
  }

  // 5. Update member and dispatch notification + audit concurrently in a single round-trip
  member.currentSubscriptionId = subscription._id;
  member.status = subStatus;
  member.dueAmount = pendingDue;

  const postTasks = [member.save()];

  if (hasDueReminder) {
    const gym = req.gym || (await Gym.findById(req.gymId));
    const dueMessage = `Hi ${member.name}, gentle reminder from ${gym?.name || 'your gym'}. You have a pending due of ₹${pendingDue.toLocaleString()} for your ${plan.name} membership. Promised date: ${reminderDate.toLocaleDateString()}. Contact: ${gym?.phone || ''}.`;
    const whatsappUrl = member.phone ? generateWhatsAppUrl(member.phone, dueMessage) : '';

    postTasks.push(
      Notification.create({
        gymId: req.gymId,
        memberId: member._id,
        subscriptionId: subscription._id,
        type: 'due_reminder',
        title: `💰 Pending Due Reminder: ${member.name} (₹${pendingDue})`,
        message: dueMessage,
        daysLeft: parsedDueDays,
        recipientPhone: member.phone,
        whatsappUrl,
      })
    );
  }

  postTasks.push(
    AuditLog.create({
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
    })
  );

  await Promise.all(postTasks);

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

  // 1. Concurrently fetch member and target renewal plan
  const [member, plan] = await Promise.all([
    Member.findOne({ _id: id, gymId: req.gymId }).populate('currentSubscriptionId'),
    MembershipPlan.findOne({ _id: planId, gymId: req.gymId }),
  ]);

  if (!member) throw ApiError.notFound('Member not found');
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
  const pendingDue = Math.max(0, payableAmount - paymentAmount);

  let paymentStatus = 'unpaid';
  if (paymentAmount > payableAmount) {
    paymentStatus = 'overpaid'; // Advance payment
  } else if (paymentAmount >= payableAmount && payableAmount > 0) {
    paymentStatus = 'paid';
  } else if (paymentAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  // 2. Pre-compute reminder fields upfront to avoid duplicate write
  const parsedDueDays = parseInt(dueReminderDays, 10);
  const hasDueReminder = pendingDue > 0 && !isNaN(parsedDueDays) && parsedDueDays > 0;
  let reminderDate = null;
  let reminderNotes = '';

  if (hasDueReminder) {
    reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parsedDueDays);
    reminderDate.setHours(0, 0, 0, 0);
    reminderNotes = dueReminderNotes || `Promised in ${parsedDueDays} days`;
  }

  // 3. Create Subscription in a single write with snapshots
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
    dueAmount: pendingDue,
    startDate: start,
    endDate: end,
    status: 'active',
    paymentStatus,
    dueReminderDays: hasDueReminder ? parsedDueDays : null,
    dueReminderDate: reminderDate,
    dueReminderNotes: reminderNotes,
    createdBy: req.user._id,
  });

  // 4. Record Payment if paid > 0 (fast index lookup)
  let paymentRecord = null;
  if (paymentAmount > 0) {
    const lastPayment = await Payment.findOne({ gymId: req.gymId })
      .sort({ createdAt: -1 })
      .select('receiptNumber')
      .lean();

    let nextNumber = 1;
    if (lastPayment?.receiptNumber) {
      const match = lastPayment.receiptNumber.match(/(\d+)/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const receiptNumber = `REC-${String(nextNumber).padStart(5, '0')}`;

    paymentRecord = await Payment.create({
      gymId: req.gymId,
      memberId: member._id,
      subscriptionId: newSubscription._id,
      receiptNumber,
      amount: paymentAmount,
      amountPaidSnapshot: paymentAmount,
      remainingBalanceSnapshot: pendingDue,
      paymentMethod,
      transactionReference,
      paymentDate: new Date(),
      recordedBy: req.user._id,
      recordedByName: req.user.name,
      notes: `Renewal for ${plan.name}`,
    });
  }

  // 5. Update member and dispatch notification + audit concurrently
  member.currentSubscriptionId = newSubscription._id;
  member.status = 'active';
  member.dueAmount = pendingDue;

  const postTasks = [member.save()];

  if (hasDueReminder) {
    const gym = req.gym || (await Gym.findById(req.gymId));
    const dueMessage = `Hi ${member.name}, gentle reminder from ${gym?.name || 'your gym'}. You have a pending due of ₹${pendingDue.toLocaleString()} for your ${plan.name} renewal. Promised date: ${reminderDate.toLocaleDateString()}. Contact: ${gym?.phone || ''}.`;
    const whatsappUrl = member.phone ? generateWhatsAppUrl(member.phone, dueMessage) : '';

    postTasks.push(
      Notification.create({
        gymId: req.gymId,
        memberId: member._id,
        subscriptionId: newSubscription._id,
        type: 'due_reminder',
        title: `💰 Pending Due Reminder: ${member.name} (₹${pendingDue})`,
        message: dueMessage,
        daysLeft: parsedDueDays,
        recipientPhone: member.phone,
        whatsappUrl,
      })
    );
  }

  postTasks.push(
    AuditLog.create({
      gymId: req.gymId,
      userId: req.user._id,
      action: 'SUBSCRIPTION_RENEW',
      details: {
        memberId: member._id,
        subscriptionId: newSubscription._id,
        planName: plan.name,
        amountPaid: paymentAmount,
      },
    })
  );

  await Promise.all(postTasks);

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
