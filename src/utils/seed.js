import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.js';
import Gym from '../models/Gym.js';
import GymMembership from '../models/GymMembership.js';
import Member from '../models/Member.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import SaaSPlan from '../models/SaaSPlan.js';
import GymSaaSSubscription from '../models/GymSaaSSubscription.js';

const seedDatabase = async () => {
  try {
    console.log('[Seeder] Connecting to MongoDB...');
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitcore_saas'
    );
    console.log('[Seeder] Connected!');

    // Clean existing records to allow clean re-seeding
    console.log('[Seeder] Resetting collections...');
    await Promise.all([
      User.deleteMany({}),
      Gym.deleteMany({}),
      GymMembership.deleteMany({}),
      Member.deleteMany({}),
      MembershipPlan.deleteMany({}),
      Subscription.deleteMany({}),
      Payment.deleteMany({}),
      Expense.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      SaaSPlan.deleteMany({}),
      GymSaaSSubscription.deleteMany({}),
    ]);

    // 1. Create SaaS Plans
    const growthPlan = await SaaSPlan.create({
      name: 'FitCore Growth Pro',
      price: 2199,
      duration: 3,
      durationUnit: 'months',
      badge: 'Popular',
      isActive: true,
      features: ['All Core Modules', 'PDF Receipts', 'Staff RBAC', 'Priority Support'],
    });

    // 2. Create Gym Owner User (Rahul Sharma)
    const owner = await User.create({
      name: 'Rahul Sharma',
      email: 'rahul@fitcore.app',
      password: 'password123',
      phone: '9876543210',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      status: 'active',
      phoneVerified: true,
    });

    // 3. Create Gym (Vikram Gym)
    const gym = await Gym.create({
      name: 'Vikram Gym',
      slug: 'vikram-gym',
      ownerId: owner._id,
      phone: '9876543210',
      email: 'contact@vikramgym.com',
      address: {
        street: '45 Ring Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
      },
      currency: { code: 'INR', symbol: '₹' },
      status: 'active',
      settings: {
        memberCodePrefix: 'FG',
        nextMemberNumber: 6,
      },
      onboardingCompleted: true,
    });

    // 4. Create GymMembership for Owner
    await GymMembership.create({
      userId: owner._id,
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

    // SaaS Subscription for Vikram Gym
    await GymSaaSSubscription.create({
      gymId: gym._id,
      planId: growthPlan._id,
      planNameSnapshot: growthPlan.name,
      durationSnapshot: growthPlan.duration,
      durationUnitSnapshot: growthPlan.durationUnit,
      amount: growthPlan.price,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    // 5. Create Membership Plans (from image 3)
    const monthlyPlan = await MembershipPlan.create({
      gymId: gym._id,
      name: 'Monthly Plan',
      duration: 1,
      durationUnit: 'months',
      price: 1200,
      description: 'Standard monthly gym access',
      status: 'active',
    });

    const quarterlyPlan = await MembershipPlan.create({
      gymId: gym._id,
      name: 'Quarterly Plan',
      duration: 3,
      durationUnit: 'months',
      price: 3000,
      description: 'Quarterly commitment with 15% savings',
      status: 'active',
    });

    const halfYearlyPlan = await MembershipPlan.create({
      gymId: gym._id,
      name: 'Half Yearly Plan',
      duration: 6,
      durationUnit: 'months',
      price: 5500,
      description: 'Half-yearly fitness access',
      status: 'active',
    });

    const yearlyPlan = await MembershipPlan.create({
      gymId: gym._id,
      name: 'Yearly Plan',
      duration: 12,
      durationUnit: 'months',
      price: 9000,
      description: 'Annual premium gym membership',
      status: 'inactive',
    });

    // 6. Create Members (from image 2)
    const now = new Date();

    const membersData = [
      {
        code: 'FG-0001',
        name: 'Rahul Sharma',
        email: 'rahul@email.com',
        phone: '9876543210',
        plan: quarterlyPlan,
        status: 'active',
        startDaysAgo: 45,
        durationMonths: 3,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      },
      {
        code: 'FG-0002',
        name: 'Priya Verma',
        email: 'priya@email.com',
        phone: '9876543211',
        plan: monthlyPlan,
        status: 'active',
        startDaysAgo: 10,
        durationMonths: 1,
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
      },
      {
        code: 'FG-0003',
        name: 'Amit Kumar',
        email: 'amit@email.com',
        phone: '9876543212',
        plan: halfYearlyPlan,
        status: 'active',
        startDaysAgo: 60,
        durationMonths: 6,
        avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80',
      },
      {
        code: 'FG-0004',
        name: 'Sneha Patel',
        email: 'sneha@email.com',
        phone: '9876543213',
        plan: monthlyPlan,
        status: 'expired',
        startDaysAgo: 50,
        durationMonths: 1,
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&auto=format&fit=crop&q=80',
      },
      {
        code: 'FG-0005',
        name: 'Rohit Mehta',
        email: 'rohit@email.com',
        phone: '9876543214',
        plan: yearlyPlan,
        status: 'expired',
        startDaysAgo: 400,
        durationMonths: 12,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      },
    ];

    let receiptCounter = 1;
    for (const mData of membersData) {
      const startDate = new Date(now.getTime() - mData.startDaysAgo * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + mData.durationMonths);

      const member = await Member.create({
        gymId: gym._id,
        memberCode: mData.code,
        name: mData.name,
        email: mData.email,
        phone: mData.phone,
        avatar: mData.avatar,
        joiningDate: startDate,
        status: mData.status,
      });

      // Create subscription
      const sub = await Subscription.create({
        gymId: gym._id,
        memberId: member._id,
        planId: mData.plan._id,
        planNameSnapshot: mData.plan.name,
        durationSnapshot: mData.plan.duration,
        durationUnitSnapshot: mData.plan.durationUnit,
        originalPrice: mData.plan.price,
        payableAmount: mData.plan.price,
        amountPaid: mData.plan.price,
        startDate,
        endDate,
        status: mData.status,
        paymentStatus: 'paid',
        createdBy: owner._id,
      });

      member.currentSubscriptionId = sub._id;
      await member.save();

      // Create Payment
      const receiptNumber = `REC-${String(receiptCounter++).padStart(5, '0')}`;
      await Payment.create({
        gymId: gym._id,
        memberId: member._id,
        subscriptionId: sub._id,
        receiptNumber,
        amount: mData.plan.price,
        paymentMethod: 'upi',
        transactionReference: 'UPI-' + Math.floor(100000000000 + Math.random() * 900000000000),
        paymentDate: startDate,
        recordedBy: owner._id,
        recordedByName: owner.name,
        notes: `Fee for ${mData.plan.name}`,
      });
    }

    // 7. Add Payments specifically for this month to reach authentic revenue figures
    // Create additional real payments for this month
    const thisMonthDays = [2, 5, 8, 12, 15, 18, 20, 21];
    const amounts = [1200, 3000, 5500, 1200, 3000, 1200, 5500, 3000];

    const firstMember = await Member.findOne({ gymId: gym._id, memberCode: 'FG-0001' });
    const firstSub = await Subscription.findOne({ gymId: gym._id, memberId: firstMember._id });

    for (let i = 0; i < thisMonthDays.length; i++) {
      const payDate = new Date(now.getFullYear(), now.getMonth(), thisMonthDays[i]);
      const receiptNumber = `REC-${String(receiptCounter++).padStart(5, '0')}`;
      await Payment.create({
        gymId: gym._id,
        memberId: firstMember._id,
        subscriptionId: firstSub._id,
        receiptNumber,
        amount: amounts[i],
        paymentMethod: i % 2 === 0 ? 'upi' : 'card',
        transactionReference: 'TXN-' + Math.floor(1000000000 + Math.random() * 9000000000),
        paymentDate: payDate,
        recordedBy: owner._id,
        recordedByName: owner.name,
        notes: 'Monthly membership payment installment',
      });
    }

    // 8. Create Real Expenses
    await Expense.create([
      {
        gymId: gym._id,
        title: 'Gym Facility Monthly Rent',
        category: 'rent',
        amount: 24000,
        date: new Date(now.getFullYear(), now.getMonth(), 1),
        description: 'Main gym hall commercial rental payment',
        recordedBy: owner._id,
        recordedByName: owner.name,
      },
      {
        gymId: gym._id,
        title: 'Electricity & AC Utility Bill',
        category: 'electricity',
        amount: 6500,
        date: new Date(now.getFullYear(), now.getMonth(), 5),
        description: 'Monthly electricity bill',
        recordedBy: owner._id,
        recordedByName: owner.name,
      },
      {
        gymId: gym._id,
        title: 'Treadmill Belt Maintenance & Lubrication',
        category: 'maintenance',
        amount: 4000,
        date: new Date(now.getFullYear(), now.getMonth(), 10),
        description: 'Quarterly maintenance for 4 cardio treadmills',
        recordedBy: owner._id,
        recordedByName: owner.name,
      },
    ]);

    // 9. Create Real Audit Logs
    await AuditLog.create([
      {
        gymId: gym._id,
        userId: owner._id,
        action: 'MEMBER_CREATE',
        details: { name: 'Priya Sharma', memberCode: 'FG-0002' },
        createdAt: new Date(now.getTime() - 2 * 60 * 1000),
      },
      {
        gymId: gym._id,
        userId: owner._id,
        action: 'PAYMENT_RECORD',
        details: { amount: 1200, receiptNumber: 'REC-00008' },
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      },
      {
        gymId: gym._id,
        userId: owner._id,
        action: 'SUBSCRIPTION_RENEW',
        details: { planName: 'Monthly Plan', amountPaid: 1200 },
        createdAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
      {
        gymId: gym._id,
        userId: owner._id,
        action: 'MEMBER_CREATE',
        details: { name: 'Rohit Kumar', memberCode: 'FG-0005' },
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      },
    ]);

    // 10. Create Real Notifications
    await Notification.create([
      {
        gymId: gym._id,
        type: 'expiry_reminder',
        title: 'Upcoming Membership Expiry',
        message: 'Rahul Sharma (FG-0001) Quarterly Plan expires in 2 days.',
        createdAt: new Date(),
      },
      {
        gymId: gym._id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'Payment of ₹1,200 recorded for Priya Verma (REC-00002).',
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      },
      {
        gymId: gym._id,
        type: 'new_member',
        title: 'New Member Registered',
        message: 'Amit Kumar joined with Half Yearly Plan.',
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    ]);

    console.log('[Seeder] Database seeded successfully!');
    console.log(`[Credentials] Owner Login: rahul@fitcore.app / password123`);
    console.log(`[Gym] Vikram Gym (_id: ${gym._id})`);
    process.exit(0);
  } catch (error) {
    console.error('[Seeder Error]:', error);
    process.exit(1);
  }
};

seedDatabase();
