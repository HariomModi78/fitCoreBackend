import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Gym from '../models/Gym.js';
import GymMembership from '../models/GymMembership.js';
import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';
import Otp from '../models/Otp.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendWhatsAppOtp, formatPhoneNumberForWhatsApp } from '../utils/whatsappService.js';

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'fitcore_super_secret_jwt_access_key_2025',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, gymName, verificationToken } = req.body;

  if (!name || !email || !password || !gymName) {
    throw ApiError.badRequest('Name, email, password, and gym name are required');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // Check if mobile number was verified via WhatsApp OTP
  let phoneVerified = false;
  if (phone) {
    const formattedPhone = formatPhoneNumberForWhatsApp(phone);
    const validOtp = await Otp.findOne({
      phone: formattedPhone,
      purpose: 'phone_verification',
      verified: true,
      ...(verificationToken ? { verificationToken } : {}),
      updatedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (validOtp) {
      phoneVerified = true;
    }
  }

  // Create user
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    phone,
    phoneVerified,
  });

  // Create Gym
  const slug = gymName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30) + '-' + Math.random().toString(36).substring(2, 6);

  const gym = await Gym.create({
    name: gymName,
    slug,
    ownerId: user._id,
    phone: phone || '0000000000',
    email: email.toLowerCase(),
    status: 'trial',
    settings: {
      memberCodePrefix: 'FG',
      nextMemberNumber: 1,
    },
  });

  // Create Owner Membership
  const membership = await GymMembership.create({
    userId: user._id,
    gymId: gym._id,
    role: 'owner',
    permissions: [
      'manage_members',
      'view_members',
      'manage_memberships',
      'record_payments',
      'view_payments',
      'view_reports',
      'manage_expenses',
    ],
    status: 'active',
  });

  // Create default SaaS subscription (14-day trial)
  let defaultSaaSPlan = await SaaSPlan.findOne({ isActive: true }).sort({ sortOrder: 1, price: 1 });
  if (!defaultSaaSPlan) {
    defaultSaaSPlan = await SaaSPlan.create({
      name: 'FitCore Growth Pro',
      price: 2199,
      duration: 3,
      durationUnit: 'months',
      badge: 'Popular',
      isActive: true,
    });
  }

  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await GymSaaSSubscription.create({
    gymId: gym._id,
    planId: defaultSaaSPlan._id,
    planNameSnapshot: defaultSaaSPlan.name,
    durationSnapshot: defaultSaaSPlan.duration,
    durationUnitSnapshot: defaultSaaSPlan.durationUnit,
    amount: 0,
    currency: 'INR',
    status: 'trial',
    startDate: new Date(),
    endDate: trialEnds,
    paymentGateway: 'none',
    purchasedBy: user._id,
  });

  // Ensure gym record has trial expiry and saasPlanId set
  gym.saasPlanId = defaultSaaSPlan._id;
  gym.saasStatus = 'trial';
  gym.trialEndsAt = trialEnds;
  gym.saasExpiresAt = trialEnds;
  await gym.save();

  const token = generateToken(user._id);

  return ApiResponse.created(
    res,
    {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        phoneVerified: user.phoneVerified,
      },
      gym: {
        _id: gym._id,
        name: gym.name,
        slug: gym.slug,
        status: gym.status,
      },
      role: membership.role,
      token,
    },
    'Gym owner registered successfully'
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Find user's gyms
  const memberships = await GymMembership.find({
    userId: user._id,
  }).populate('gymId');

  let activeGym = null;
  let activeRole = 'staff';
  let permissions = [];

  if (memberships.length > 0) {
    activeGym = memberships[0].gymId;
    activeRole = memberships[0].role;
    permissions = memberships[0].permissions;
  }

  if (!activeGym) {
    activeGym = await Gym.findOne({ ownerId: user._id });
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);

  return ApiResponse.success(
    res,
    {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        phoneVerified: user.phoneVerified,
        isSuperAdmin: user.isSuperAdmin,
        status: user.status,
      },
      activeGym,
      memberships: memberships.map((m) => ({
        gym: m.gymId,
        role: m.role,
        permissions: m.permissions,
      })),
      role: activeRole,
      permissions,
      token,
    },
    'Login successful'
  );
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const memberships = await GymMembership.find({
    userId: req.user._id,
  }).populate('gymId');

  let activeGym = null;
  let role = 'staff';
  let permissions = [];

  const targetGymId = req.header('X-Gym-Id') || req.query.gymId;
  const currentMembership = targetGymId
    ? memberships.find((m) => m.gymId?._id?.toString() === targetGymId)
    : memberships[0];

  if (currentMembership) {
    activeGym = currentMembership.gymId;
    role = currentMembership.role;
    permissions = currentMembership.permissions;
  }

  if (!activeGym) {
    activeGym = await Gym.findOne({ ownerId: req.user._id });
  }

  return ApiResponse.success(
    res,
    {
      user: req.user,
      activeGym,
      memberships: memberships.map((m) => ({
        gym: m.gymId,
        role: m.role,
        permissions: m.permissions,
      })),
      role,
      permissions,
    },
    'Current user session retrieved'
  );
});

const formatMaskedPhone = (phoneStr) => {
  if (!phoneStr) return 'registered mobile';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `+${digits.slice(0, 2)} ••••••${digits.slice(-4)}`;
  }
  return '••••••' + digits.slice(-2);
};

export const sendWhatsAppOtpHandler = asyncHandler(async (req, res) => {
  const { phone, purpose = 'phone_verification' } = req.body;
  const targetPhone = phone || req.user?.phone;

  if (!targetPhone) {
    throw ApiError.badRequest('Mobile number is required to send WhatsApp OTP');
  }

  const formattedPhone = formatPhoneNumberForWhatsApp(targetPhone);
  if (!formattedPhone || formattedPhone.length < 10) {
    throw ApiError.badRequest('Please enter a valid 10-digit mobile number');
  }

  // Enforce 60-second cooldown per phone & purpose to prevent spam/abuse
  const recentOtp = await Otp.findOne({
    phone: formattedPhone,
    purpose,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recentOtp) {
    const remainingSeconds = Math.ceil(
      (60 * 1000 - (Date.now() - new Date(recentOtp.createdAt).getTime())) / 1000
    );
    throw ApiError.badRequest(
      `Please wait ${remainingSeconds}s before requesting a new verification code`
    );
  }

  // If purpose is forgot_password, ensure user exists with this phone
  if (purpose === 'forgot_password') {
    const rawDigits = targetPhone.replace(/\D/g, '').slice(-10);
    const existing = await User.findOne({
      phone: { $regex: rawDigits + '$' },
    });
    if (!existing) {
      throw ApiError.notFound('No account found associated with this mobile number');
    }
  }

  // Generate cryptographically secure 6-digit numeric OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = Otp.hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate any prior unverified OTP for this phone & purpose
  await Otp.deleteMany({
    phone: formattedPhone,
    purpose,
    verified: false,
  });

  // Store hashed OTP (never store plaintext OTP in database)
  await Otp.create({
    identifier: formattedPhone,
    phone: formattedPhone,
    otp: hashedOtp,
    purpose,
    expiresAt,
  });

  // Dispatch privately to user's phone via WhatsApp
  await sendWhatsAppOtp({
    phone: formattedPhone,
    otp,
    purpose,
  });

  // SECURE RESPONSE: Never return OTP or URLs containing OTP to client
  return ApiResponse.success(
    res,
    {
      phone: formattedPhone,
      maskedPhone: formatMaskedPhone(formattedPhone),
      expiresAt,
    },
    'Verification code has been dispatched to your WhatsApp'
  );
});

export const verifyWhatsAppOtpHandler = asyncHandler(async (req, res) => {
  const { phone, otp, purpose = 'phone_verification' } = req.body;
  const targetPhone = phone || req.user?.phone;

  if (!targetPhone || !otp) {
    throw ApiError.badRequest('Mobile number and 6-digit OTP code are required');
  }

  const formattedPhone = formatPhoneNumberForWhatsApp(targetPhone);
  const otpRecord = await Otp.findOne({
    phone: formattedPhone,
    purpose,
    verified: false,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw ApiError.badRequest('No active verification code found. Please request a new code.');
  }

  if (new Date() > otpRecord.expiresAt) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw ApiError.badRequest('Verification code has expired. Please request a new one.');
  }

  if (otpRecord.attempts >= 5) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  // Verify against cryptographically hashed OTP
  if (!otpRecord.verifyOtp(otp)) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    const remaining = 5 - otpRecord.attempts;
    throw ApiError.badRequest(
      `Incorrect verification code. ${remaining} attempt(s) remaining.`
    );
  }

  // Mark OTP as verified & generate verificationToken
  const verificationToken = crypto.randomUUID();

  otpRecord.verified = true;
  otpRecord.verificationToken = verificationToken;
  await otpRecord.save();

  // If user is currently authenticated via token
  if (req.user) {
    const user = await User.findById(req.user._id);
    if (user) {
      user.phoneVerified = true;
      if (!user.phone || user.phone !== targetPhone) {
        user.phone = targetPhone;
      }
      await user.save({ validateBeforeSave: false });
    }
  } else {
    // If an existing registered user has this phone, mark them verified
    const rawDigits = targetPhone.replace(/\D/g, '').slice(-10);
    await User.updateMany(
      { phone: { $regex: rawDigits + '$' } },
      { $set: { phoneVerified: true } }
    );
  }

  return ApiResponse.success(
    res,
    {
      phone: formattedPhone,
      verified: true,
      verificationToken,
    },
    'Mobile number verified successfully!'
  );
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier || !identifier.trim()) {
    throw ApiError.badRequest('Please enter your registered email address or mobile number');
  }

  const cleanIdentifier = identifier.trim();
  const isEmail = cleanIdentifier.includes('@');

  let user;
  if (isEmail) {
    user = await User.findOne({ email: cleanIdentifier.toLowerCase() });
  } else {
    const digits = cleanIdentifier.replace(/\D/g, '').slice(-10);
    user = await User.findOne({
      phone: { $regex: digits + '$' },
    });
  }

  if (!user) {
    throw ApiError.notFound('No account found with this email or mobile number');
  }

  const targetPhone = user.phone || (!isEmail ? cleanIdentifier : null);
  if (!targetPhone) {
    throw ApiError.badRequest(
      'No mobile number registered with this account. Please contact gym administration.'
    );
  }

  const formattedPhone = formatPhoneNumberForWhatsApp(targetPhone);

  // Enforce 60-second cooldown
  const recentOtp = await Otp.findOne({
    identifier: user.email,
    purpose: 'forgot_password',
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recentOtp) {
    const remainingSeconds = Math.ceil(
      (60 * 1000 - (Date.now() - new Date(recentOtp.createdAt).getTime())) / 1000
    );
    throw ApiError.badRequest(
      `Please wait ${remainingSeconds}s before requesting a new password reset code`
    );
  }

  // Generate cryptographically secure 6-digit OTP & store hash
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = Otp.hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Set hashed token on user model
  user.resetPasswordToken = hashedOtp;
  user.resetPasswordExpire = expiresAt;
  await user.save({ validateBeforeSave: false });

  // Store in Otp collection
  await Otp.deleteMany({
    identifier: user.email,
    purpose: 'forgot_password',
  });
  await Otp.create({
    identifier: user.email,
    phone: formattedPhone,
    email: user.email,
    otp: hashedOtp,
    purpose: 'forgot_password',
    expiresAt,
  });

  // Dispatch privately via WhatsApp
  await sendWhatsAppOtp({
    phone: formattedPhone,
    otp,
    purpose: 'forgot_password',
  });

  const maskedPhone = formatMaskedPhone(formattedPhone);

  // SECURE RESPONSE: Never return OTP or direct wa.me link with code to client
  return ApiResponse.success(
    res,
    {
      identifier: user.email,
      maskedPhone,
      channel: 'whatsapp',
      expiresAt,
    },
    `Password reset code has been sent to your WhatsApp (${maskedPhone})`
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;

  if (!identifier || !otp || !newPassword) {
    throw ApiError.badRequest('Identifier, OTP code, and new password are required');
  }

  if (newPassword.length < 6) {
    throw ApiError.badRequest('New password must be at least 6 characters');
  }

  const cleanIdentifier = identifier.trim();
  const isEmail = cleanIdentifier.includes('@');
  const hashedInputOtp = Otp.hashOtp(otp);

  let user;
  if (isEmail) {
    user = await User.findOne({ email: cleanIdentifier.toLowerCase() }).select(
      '+password +resetPasswordToken +resetPasswordExpire'
    );
  } else {
    const digits = cleanIdentifier.replace(/\D/g, '').slice(-10);
    user = await User.findOne({
      phone: { $regex: digits + '$' },
    }).select('+password +resetPasswordToken +resetPasswordExpire');
  }

  if (!user) {
    throw ApiError.notFound('Account not found');
  }

  if (!user.resetPasswordExpire || new Date() > user.resetPasswordExpire) {
    throw ApiError.badRequest('Password reset code has expired. Please request a new code.');
  }

  if (user.resetPasswordToken !== hashedInputOtp) {
    const otpDoc = await Otp.findOne({
      identifier: user.email,
      purpose: 'forgot_password',
    });
    if (otpDoc) {
      otpDoc.attempts += 1;
      if (otpDoc.attempts >= 5) {
        await Otp.deleteOne({ _id: otpDoc._id });
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
      }
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      throw ApiError.badRequest(`Invalid OTP code. ${remaining} attempt(s) remaining.`);
    }
    throw ApiError.badRequest('Invalid OTP code. Please enter the correct code.');
  }

  // Update password & clear reset token
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.phoneVerified = true;
  await user.save();

  // Clear Otp records
  await Otp.deleteMany({
    identifier: user.email,
    purpose: 'forgot_password',
  });

  return ApiResponse.success(
    res,
    null,
    'Your password has been reset successfully! You can now log in with your new password.'
  );
});
