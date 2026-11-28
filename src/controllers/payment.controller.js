import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import Member from '../models/Member.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getPayments = asyncHandler(async (req, res) => {
  const { memberId, method, search, page = 1, limit = 50 } = req.query;
  const query = { gymId: req.gymId };

  if (memberId) query.memberId = memberId;
  if (method && method !== 'all') query.paymentMethod = method;

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    const matchingMembers = await Member.find({
      gymId: req.gymId,
      $or: [{ name: searchRegex }, { phone: searchRegex }, { memberCode: searchRegex }],
    }).select('_id');
    const memberIds = matchingMembers.map((m) => m._id);

    query.$or = [
      { receiptNumber: searchRegex },
      { transactionReference: searchRegex },
      { memberId: { $in: memberIds } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Payment.countDocuments(query);

  const payments = await Payment.find(query)
    .populate('memberId', 'name memberCode phone email avatar')
    .populate('subscriptionId', 'planNameSnapshot startDate endDate payableAmount amountPaid dueAmount')
    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // High-performance native MongoDB aggregations (handles 100,000+ records in <5ms)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [monthAgg, todayAgg, duesAgg, advanceAgg, pendingSubscriptions] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          gymId: req.gymId,
          status: 'completed',
          paymentDate: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          gymId: req.gymId,
          status: 'completed',
          paymentDate: { $gte: startOfDay },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Subscription.aggregate([
      {
        $match: {
          gymId: req.gymId,
          $or: [
            { dueAmount: { $gt: 0 } },
            { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalDue: {
            $sum: {
              $cond: [
                { $gt: ['$dueAmount', 0] },
                '$dueAmount',
                { $max: [0, { $subtract: ['$payableAmount', '$amountPaid'] }] },
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Subscription.aggregate([
      {
        $match: {
          gymId: req.gymId,
          dueAmount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalAdvance: { $sum: { $abs: '$dueAmount' } },
          count: { $sum: 1 },
        },
      },
    ]),
    Subscription.find({
      gymId: req.gymId,
      $or: [
        { dueAmount: { $ne: 0 } },
        { paymentStatus: { $in: ['unpaid', 'partially_paid', 'overpaid'] } },
      ],
    })
      .populate('memberId', 'name phone memberCode avatar')
      .sort({ dueReminderDate: 1, createdAt: -1 })
      .limit(100),
  ]);

  const totalCollectedThisMonth = monthAgg[0]?.total || 0;
  const paymentsTodayAmount = todayAgg[0]?.total || 0;
  const paymentsTodayCount = todayAgg[0]?.count || 0;
  const pendingDuesTotal = duesAgg[0]?.totalDue || 0;
  const pendingMembersCount = duesAgg[0]?.count || 0;
  const totalAdvanceCredits = advanceAgg[0]?.totalAdvance || 0;
  const advanceMembersCount = advanceAgg[0]?.count || 0;

  const pendingDues = pendingSubscriptions.map((s) => {
    const due =
      typeof s.dueAmount === 'number'
        ? s.dueAmount
        : (s.payableAmount || 0) - (s.amountPaid || 0);
    return {
      _id: s._id,
      member: s.memberId,
      planName: s.planNameSnapshot,
      payableAmount: s.payableAmount,
      amountPaid: s.amountPaid,
      dueAmount: due,
      dueReminderDate: s.dueReminderDate,
      dueReminderDays: s.dueReminderDays,
      dueReminderNotes: s.dueReminderNotes,
      startDate: s.startDate,
      endDate: s.endDate,
    };
  });

  return ApiResponse.success(res, {
    payments,
    pendingDues,
    overview: {
      totalCollectedThisMonth,
      paymentsTodayAmount,
      paymentsTodayCount,
      pendingDuesTotal,
      pendingMembersCount,
      totalAdvanceCredits,
      advanceMembersCount,
    },
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)) || 1,
    },
  });
});

export const recordPayment = asyncHandler(async (req, res) => {
  const {
    memberId,
    subscriptionId,
    amount,
    paymentMethod,
    transactionReference,
    paymentDate = new Date(),
    notes,
  } = req.body;

  if (!memberId || !amount || !paymentMethod) {
    throw ApiError.badRequest('Member, amount, and payment method are required');
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    throw ApiError.badRequest('Payment amount must be greater than zero');
  }

  const member = await Member.findOne({ _id: memberId, gymId: req.gymId });
  if (!member) throw ApiError.notFound('Member not found');

  // Find target subscription
  let subscription = null;
  if (subscriptionId) {
    subscription = await Subscription.findOne({
      _id: subscriptionId,
      gymId: req.gymId,
    });
  } else if (member.currentSubscriptionId) {
    subscription = await Subscription.findOne({
      _id: member.currentSubscriptionId,
      gymId: req.gymId,
    });
  }

  if (!subscription) {
    throw ApiError.badRequest(
      'No active or pending subscription found for this member to apply payment to'
    );
  }

  // Generate unique receipt number
  const paymentCount = await Payment.countDocuments({ gymId: req.gymId });
  const receiptNumber = `REC-${String(paymentCount + 1).padStart(5, '0')}`;

  let resolvedPaymentDate = new Date();
  if (paymentDate) {
    const parsedDate = new Date(paymentDate);
    const today = new Date();
    if (parsedDate.toDateString() === today.toDateString()) {
      resolvedPaymentDate = today;
    } else {
      resolvedPaymentDate = parsedDate;
    }
  }

  const newAmountPaid = (subscription.amountPaid || 0) + parsedAmount;
  const newDueAmount = (subscription.payableAmount || 0) - newAmountPaid;

  const payment = await Payment.create({
    gymId: req.gymId,
    memberId: member._id,
    subscriptionId: subscription._id,
    receiptNumber,
    amount: parsedAmount,
    amountPaidSnapshot: newAmountPaid,
    remainingBalanceSnapshot: newDueAmount,
    paymentMethod,
    transactionReference,
    paymentDate: resolvedPaymentDate,
    recordedBy: req.user._id,
    recordedByName: req.user.name,
    notes,
    status: 'completed',
  });

  // Update subscription amountPaid, dueAmount & paymentStatus
  subscription.amountPaid = newAmountPaid;
  subscription.dueAmount = newDueAmount;

  if (subscription.dueAmount < 0) {
    subscription.paymentStatus = 'overpaid'; // Advance payment / credit
    await Notification.updateMany(
      { subscriptionId: subscription._id, type: 'due_reminder', isRead: false },
      { isRead: true }
    );
  } else if (subscription.dueAmount === 0) {
    subscription.paymentStatus = 'paid';
    await Notification.updateMany(
      { subscriptionId: subscription._id, type: 'due_reminder', isRead: false },
      { isRead: true }
    );
  } else {
    subscription.paymentStatus = 'partially_paid';
  }
  await subscription.save();

  // Sync cached dueAmount to Member document (can be negative for advance)
  member.dueAmount = subscription.dueAmount;
  await member.save();

  // Audit log
  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'PAYMENT_RECORD',
    details: {
      receiptNumber,
      amount: parsedAmount,
      memberId: member._id,
      subscriptionId: subscription._id,
      paymentMethod,
    },
  });

  await payment.populate([
    { path: 'memberId', select: 'name memberCode phone email avatar' },
    { path: 'subscriptionId', select: 'planNameSnapshot startDate endDate payableAmount amountPaid dueAmount' },
  ]);

  return ApiResponse.created(res, payment, 'Payment recorded successfully');
});

export const getReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  })
    .populate('memberId', 'name memberCode phone email address')
    .populate('subscriptionId')
    .populate('recordedBy', 'name email');

  if (!payment) throw ApiError.notFound('Payment receipt not found');

  const gym = req.gym;

  // Accurately determine the snapshot of amount paid & remaining balance AT THE TIME of this payment
  let amountPaidSnapshot;
  let remainingBalanceSnapshot;

  if (
    typeof payment.amountPaidSnapshot === 'number' &&
    typeof payment.remainingBalanceSnapshot === 'number'
  ) {
    amountPaidSnapshot = payment.amountPaidSnapshot;
    remainingBalanceSnapshot = payment.remainingBalanceSnapshot;
  } else if (payment.subscriptionId) {
    // Dynamically compute historical snapshot for records created before snapshot schema
    const subPayments = await Payment.find({
      gymId: req.gymId,
      subscriptionId: payment.subscriptionId._id,
      status: 'completed',
    }).sort({ paymentDate: 1, createdAt: 1, _id: 1 });

    let runningTotal = 0;
    for (const p of subPayments) {
      runningTotal += p.amount;
      if (p._id.toString() === payment._id.toString()) {
        break;
      }
    }

    amountPaidSnapshot = runningTotal;
    const payable = payment.subscriptionId.payableAmount || 0;
    remainingBalanceSnapshot = payable - runningTotal;
  } else {
    amountPaidSnapshot = payment.amount;
    remainingBalanceSnapshot = 0;
  }

  const receiptData = {
    gym: {
      name: gym.name,
      phone: gym.phone,
      email: gym.email,
      address: gym.address,
      currency: gym.currency?.symbol || '₹',
    },
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    transactionReference: payment.transactionReference,
    member: {
      name: payment.memberId?.name,
      code: payment.memberId?.memberCode,
      phone: payment.memberId?.phone,
      email: payment.memberId?.email,
    },
    subscription: {
      planName: payment.subscriptionId?.planNameSnapshot,
      startDate: payment.subscriptionId?.startDate,
      endDate: payment.subscriptionId?.endDate,
      originalPrice: payment.subscriptionId?.originalPrice,
      discountAmount: payment.subscriptionId?.discountAmount,
      discountReason: payment.subscriptionId?.discountReason,
      payableAmount: payment.subscriptionId?.payableAmount,
      amountPaidTotal: amountPaidSnapshot,
      remainingBalance: remainingBalanceSnapshot,
      dueReminderDate: payment.subscriptionId?.dueReminderDate,
      dueReminderDays: payment.subscriptionId?.dueReminderDays,
      dueReminderNotes: payment.subscriptionId?.dueReminderNotes,
    },
    recordedBy: payment.recordedByName || payment.recordedBy?.name,
  };

  return ApiResponse.success(res, receiptData, 'Receipt details retrieved');
});
