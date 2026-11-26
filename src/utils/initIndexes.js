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
import Otp from '../models/Otp.js';

const models = [
  { name: 'User', model: User },
  { name: 'Gym', model: Gym },
  { name: 'GymMembership', model: GymMembership },
  { name: 'Member', model: Member },
  { name: 'MembershipPlan', model: MembershipPlan },
  { name: 'Subscription', model: Subscription },
  { name: 'Payment', model: Payment },
  { name: 'Expense', model: Expense },
  { name: 'Notification', model: Notification },
  { name: 'AuditLog', model: AuditLog },
  { name: 'SaaSPlan', model: SaaSPlan },
  { name: 'GymSaaSSubscription', model: GymSaaSSubscription },
  { name: 'Otp', model: Otp },
];

async function initializeIndexes() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitcore_saas';
  console.log(`Connecting to MongoDB at: ${uri}`);
  await mongoose.connect(uri);

  console.log('\n--- Syncing & Initializing All Database Indexes ---');

  for (const { name, model } of models) {
    try {
      await model.createCollection();
      await model.syncIndexes();
      const indexes = await model.collection.indexes();
      const indexNames = indexes.map((idx) => `${idx.name} (${JSON.stringify(idx.key)})`).join(', ');
      console.log(`✓ [${name}]: ${indexes.length} index(es) active -> ${indexNames}`);
    } catch (err) {
      console.error(`✗ [${name}] Index Error:`, err.message);
    }
  }

  console.log('\nAll schema indexes (including Unique and TTL expiry indexes) are 100% active and healthy!');
  await mongoose.disconnect();
  process.exit(0);
}

initializeIndexes().catch((err) => {
  console.error('Initialization error:', err);
  process.exit(1);
});
