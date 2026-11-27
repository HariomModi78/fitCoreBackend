import Member from '../models/Member.js';
import Gym from '../models/Gym.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../middlewares/sanitize.js';

export const getMembers = asyncHandler(async (req, res) => {
  const { search, status, planId, page = 1, limit = 50 } = req.query;

  const query = { gymId: req.gymId };

  if (status && status !== 'all') {
    query.status = status;
  } else if (!status || status === 'all') {
    // Exclude archived members by default from normal view
    query.status = { $ne: 'archived' };
  }

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [
      { name: searchRegex },
      { phone: searchRegex },
      { memberCode: searchRegex },
      { email: searchRegex },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Member.countDocuments(query);

  const members = await Member.find(query)
    .populate({
      path: 'currentSubscriptionId',
      select:
        'planNameSnapshot startDate endDate payableAmount amountPaid dueAmount status paymentStatus dueReminderDate dueReminderDays dueReminderNotes',
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Count summaries for tabs
  const [totalCount, activeCount, expiredCount, upcomingCount] = await Promise.all([
    Member.countDocuments({ gymId: req.gymId, status: { $ne: 'archived' } }),
    Member.countDocuments({ gymId: req.gymId, status: 'active' }),
    Member.countDocuments({ gymId: req.gymId, status: 'expired' }),
    Member.countDocuments({ gymId: req.gymId, status: 'upcoming' }),
  ]);

  return ApiResponse.success(res, {
    members,
    counts: {
      total: totalCount,
      active: activeCount,
      expired: expiredCount,
      upcoming: upcomingCount,
      suspended: 0,
    },
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)) || 1,
    },
  });
});

export const getMemberById = asyncHandler(async (req, res) => {
  const member = await Member.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  }).populate('currentSubscriptionId');

  if (!member) {
    throw ApiError.notFound('Member not found');
  }

  // Fetch subscription history
  const subscriptions = await Subscription.find({
    memberId: member._id,
    gymId: req.gymId,
  }).sort({ createdAt: -1 });

  // Fetch payment history (latest transaction at top)
  const payments = await Payment.find({
    memberId: member._id,
    gymId: req.gymId,
  }).sort({ paymentDate: -1, createdAt: -1, _id: -1 });

  // Calculate balance
  const totalPayable = subscriptions.reduce((sum, s) => sum + (s.payableAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const outstandingBalance = Math.max(0, totalPayable - totalPaid);

  return ApiResponse.success(res, {
    member,
    subscriptions,
    payments,
    outstandingBalance,
  });
});

export const createMember = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    gender,
    dateOfBirth,
    emergencyContact,
    joiningDate,
    notes,
  } = req.body;

  if (!name || !phone) {
    throw ApiError.badRequest('Member name and phone number are required');
  }

  // Atomically increment member counter on Gym model to guarantee unique code
  const gym = await Gym.findByIdAndUpdate(
    req.gymId,
    { $inc: { 'settings.nextMemberNumber': 1 } },
    { new: true }
  );

  const prefix = gym.settings?.memberCodePrefix || 'FG';
  const memberNum = (gym.settings?.nextMemberNumber || 2) - 1;
  const memberCode = `${prefix}-${String(memberNum).padStart(4, '0')}`;

  const member = await Member.create({
    gymId: req.gymId,
    memberCode,
    name: name.trim(),
    phone: phone.trim(),
    email: email ? email.toLowerCase().trim() : '',
    gender,
    dateOfBirth,
    emergencyContact,
    joiningDate: joiningDate || new Date(),
    notes,
    status: 'upcoming',
  });

  // Log action
  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'MEMBER_CREATE',
    details: { memberId: member._id, memberCode, name: member.name },
  });

  return ApiResponse.created(res, member, 'Member registered successfully');
});

export const updateMember = asyncHandler(async (req, res) => {
  const { name, phone, email, gender, dateOfBirth, emergencyContact, notes, status } = req.body;

  const member = await Member.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!member) {
    throw ApiError.notFound('Member not found');
  }

  if (name) member.name = name.trim();
  if (phone) member.phone = phone.trim();
  if (email !== undefined) member.email = email.toLowerCase().trim();
  if (gender !== undefined) member.gender = gender;
  if (dateOfBirth !== undefined) member.dateOfBirth = dateOfBirth;
  if (emergencyContact !== undefined) member.emergencyContact = emergencyContact;
  if (notes !== undefined) member.notes = notes;
  if (status && ['active', 'expired', 'upcoming', 'archived'].includes(status)) {
    member.status = status;
  }

  await member.save();

  // Log action
  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'MEMBER_UPDATE',
    details: { memberId: member._id, changes: req.body },
  });

  return ApiResponse.success(res, member, 'Member updated successfully');
});

export const archiveMember = asyncHandler(async (req, res) => {
  const member = await Member.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!member) {
    throw ApiError.notFound('Member not found');
  }

  member.status = 'archived';
  await member.save();

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'MEMBER_ARCHIVE',
    details: { memberId: member._id, memberCode: member.memberCode },
  });

  return ApiResponse.success(res, null, 'Member archived successfully');
});
