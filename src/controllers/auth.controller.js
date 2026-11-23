import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Gym from '../models/Gym.js';
import GymMembership from '../models/GymMembership.js';
import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'fitcore_super_secret_jwt_access_key_2025',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, gymName } = req.body;

  if (!name || !email || !password || !gymName) {
    throw ApiError.badRequest('Name, email, password, and gym name are required');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    phone,
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
  let defaultSaaSPlan = await SaaSPlan.findOne({ isActive: true });
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

  await GymSaaSSubscription.create({
    gymId: gym._id,
    planId: defaultSaaSPlan._id,
    status: 'trial',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

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
    status: 'active',
  }).populate('gymId');

  let activeGym = null;
  let activeRole = 'staff';
  let permissions = [];

  if (memberships.length > 0) {
    activeGym = memberships[0].gymId;
    activeRole = memberships[0].role;
    permissions = memberships[0].permissions;
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
        isSuperAdmin: user.isSuperAdmin,
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
    status: 'active',
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
