import GymMembership from '../models/GymMembership.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { dispatchWhatsAppMessage, generateWhatsAppUrl } from '../utils/whatsappService.js';

export const getStaff = asyncHandler(async (req, res) => {
  const staffMemberships = await GymMembership.find({
    gymId: req.gymId,
  }).populate('userId', 'name email phone avatar status lastLogin');

  return ApiResponse.success(res, staffMemberships);
});

export const inviteStaff = asyncHandler(async (req, res) => {
  const { name, email, phone, permissions } = req.body;

  if (!name?.trim()) {
    throw ApiError.badRequest('Staff name is required');
  }

  if (!email?.trim()) {
    throw ApiError.badRequest('Staff email is required');
  }

  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length !== 10) {
    throw ApiError.badRequest('A valid 10-digit mobile number is required to invite staff and send WhatsApp credentials');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find or create user
  let user = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone: cleanPhone }],
  });

  let isNewUser = false;
  let tempPassword = null;

  if (!user) {
    // Generate a secure, user-friendly temporary password
    tempPassword = 'FitCore@' + Math.floor(1000 + Math.random() * 9000);
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      password: tempPassword,
      phoneVerified: true,
      status: 'active',
    });
    isNewUser = true;
  } else {
    // Update phone if not set
    if (!user.phone) {
      user.phone = cleanPhone;
      await user.save({ validateBeforeSave: false });
    }
  }

  // 2. Check if user is already a member of this gym
  const existingMembership = await GymMembership.findOne({
    userId: user._id,
    gymId: req.gymId,
  });

  if (existingMembership) {
    throw ApiError.conflict('This user is already part of your gym staff');
  }

  // 3. Create active GymMembership with restricted permissions
  const validPermissions = [
    'view_members',
    'manage_members',
    'manage_memberships',
    'record_payments',
    'view_payments',
    'view_reports',
    'manage_expenses',
    'send_notifications',
  ];

  const assignedPermissions = Array.isArray(permissions)
    ? permissions.filter((p) => validPermissions.includes(p))
    : ['view_members', 'record_payments'];

  const membership = await GymMembership.create({
    userId: user._id,
    gymId: req.gymId,
    role: 'staff',
    permissions: assignedPermissions,
    status: 'active',
  });

  // 4. Log audit action
  try {
    await AuditLog.create({
      gymId: req.gymId,
      userId: req.user._id,
      action: 'STAFF_INVITE',
      details: {
        staffUserId: user._id,
        email: user.email,
        phone: cleanPhone,
        role: membership.role,
        permissions: membership.permissions,
      },
    });
  } catch (auditErr) {
    console.warn('[Staff Invite AuditLog Warning]:', auditErr.message);
  }

  // 5. Build WhatsApp credential notification
  const gymName = req.gym?.name || 'FitCore Gym';
  const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const formattedPerms = assignedPermissions.map((p) => `• ${p.replace(/_/g, ' ')}`).join('\n');

  const waMessage = `🏋️ *Welcome to ${gymName}!*

Hi *${user.name}*, you have been added as an authorized staff member for *${gymName}* on FitCore.

📋 *Your Staff Login Credentials:*
• Login Portal: ${portalUrl}/login
• Registered Email: *${user.email}*
• Registered Mobile: *${cleanPhone}*
• Password: *${isNewUser ? tempPassword : '(Use your existing FitCore password)'}*
• Role: *Gym Staff*

🔒 *Assigned Permissions:*
${formattedPerms}

Please log in to manage gym members and operations securely.
FitCore - Stronger Together!`;

  let whatsappResult = null;
  const whatsappUrl = generateWhatsAppUrl(cleanPhone, waMessage);

  try {
    whatsappResult = await dispatchWhatsAppMessage({
      phone: cleanPhone,
      text: waMessage,
    });
    console.log(`[Staff Invite]: WhatsApp credentials sent to ${cleanPhone} (via: ${whatsappResult?.via})`);
  } catch (waErr) {
    console.warn('[Staff WhatsApp Dispatch Warning]:', waErr.message);
  }

  const populatedMembership = await GymMembership.findById(membership._id).populate(
    'userId',
    'name email phone avatar status lastLogin'
  );

  return ApiResponse.created(
    res,
    {
      membership: populatedMembership,
      credentials: {
        name: user.name,
        email: user.email,
        phone: cleanPhone,
        tempPassword: isNewUser ? tempPassword : null,
        isNewUser,
      },
      whatsappUrl,
      whatsappResult,
    },
    `Staff member invited successfully! Credentials sent to WhatsApp (${cleanPhone}).`
  );
});

export const updateStaffPermissions = asyncHandler(async (req, res) => {
  const { permissions, status } = req.body;

  const membership = await GymMembership.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!membership) throw ApiError.notFound('Staff membership not found');

  if (membership.role === 'owner') {
    throw ApiError.badRequest('Primary gym owner permissions cannot be altered');
  }

  const validPermissions = [
    'view_members',
    'manage_members',
    'manage_memberships',
    'record_payments',
    'view_payments',
    'view_reports',
    'manage_expenses',
    'send_notifications',
  ];

  if (permissions && Array.isArray(permissions)) {
    membership.permissions = permissions.filter((p) => validPermissions.includes(p));
  }
  if (status && ['active', 'suspended'].includes(status)) {
    membership.status = status;
  }

  await membership.save();

  try {
    await AuditLog.create({
      gymId: req.gymId,
      userId: req.user._id,
      action: 'STAFF_PERMISSION_CHANGE',
      details: { staffId: membership._id, permissions: membership.permissions, status: membership.status },
    });
  } catch (auditErr) {
    console.warn('[Staff Update AuditLog Warning]:', auditErr.message);
  }

  const populated = await GymMembership.findById(membership._id).populate(
    'userId',
    'name email phone avatar status lastLogin'
  );

  return ApiResponse.success(res, populated, 'Staff permissions updated successfully');
});

export const removeStaff = asyncHandler(async (req, res) => {
  const membership = await GymMembership.findOne({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!membership) throw ApiError.notFound('Staff membership not found');

  if (membership.role === 'owner') {
    throw ApiError.badRequest('Primary gym owner cannot be removed from staff');
  }

  await GymMembership.findByIdAndDelete(req.params.id);

  try {
    await AuditLog.create({
      gymId: req.gymId,
      userId: req.user._id,
      action: 'STAFF_DELETE',
      details: {
        staffMembershipId: req.params.id,
        removedUserId: membership.userId,
      },
    });
  } catch (auditErr) {
    console.warn('[Staff Delete AuditLog Warning]:', auditErr.message);
  }

  return ApiResponse.success(res, null, 'Staff member removed from gym successfully');
});
