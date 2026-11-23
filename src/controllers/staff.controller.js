import GymMembership from '../models/GymMembership.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getStaff = asyncHandler(async (req, res) => {
  const staffMemberships = await GymMembership.find({
    gymId: req.gymId,
  }).populate('userId', 'name email phone avatar status lastLogin');

  return ApiResponse.success(res, staffMemberships);
});

export const inviteStaff = asyncHandler(async (req, res) => {
  const { name, email, phone, permissions, role = 'staff' } = req.body;

  if (!email || !name) {
    throw ApiError.badRequest('Staff name and email are required');
  }

  // Find or create user
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Create new user account with temporary password
    const tempPassword = 'FitCoreStaff@' + Math.floor(1000 + Math.random() * 9000);
    user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: tempPassword,
    });
  }

  // Check if already member
  const existingMembership = await GymMembership.findOne({
    userId: user._id,
    gymId: req.gymId,
  });

  if (existingMembership) {
    throw ApiError.conflict('This user is already part of your gym');
  }

  const membership = await GymMembership.create({
    userId: user._id,
    gymId: req.gymId,
    role: role === 'owner' ? 'owner' : 'staff',
    permissions: Array.isArray(permissions) ? permissions : ['view_members', 'record_payments'],
    status: 'active',
  });

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'STAFF_INVITE',
    details: { staffUserId: user._id, email: user.email, role: membership.role },
  });

  return ApiResponse.created(res, membership, 'Staff member added successfully');
});

export const updateStaffPermissions = asyncHandler(async (req, res) => {
  const { permissions, role, status } = req.body;

  const membership = await GymMembership.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!membership) throw ApiError.notFound('Staff membership not found');

  if (permissions && Array.isArray(permissions)) {
    membership.permissions = permissions;
  }
  if (role) membership.role = role;
  if (status) membership.status = status;

  await membership.save();

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'STAFF_PERMISSION_CHANGE',
    details: { staffId: membership._id, permissions: membership.permissions },
  });

  return ApiResponse.success(res, membership, 'Staff permissions updated successfully');
});
