import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { User } from './models/User.js';
import { Gym } from './models/Gym.js';
import { GymMembership } from './models/GymMembership.js';
import { Member } from './models/Member.js';
import { MembershipPlan } from './models/MembershipPlan.js';
import { Subscription } from './models/Subscription.js';
import { Payment } from './models/Payment.js';
import { Expense } from './models/Expense.js';
import { Notification } from './models/Notification.js';
import { AuditLog } from './models/AuditLog.js';
import { SaaSPlan } from './models/SaaSPlan.js';
import { GymSaaSSubscription } from './models/GymSaaSSubscription.js';

console.log('--- Verifying FitCore Backend Phase 1 Foundation ---');

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
];

let allModelsValid = true;
models.forEach(({ name, model }) => {
  if (model && model.modelName === name) {
    console.log(`[Model Verified] ${name}`);
  } else {
    console.error(`[Model FAILED] ${name}`);
    allModelsValid = false;
  }
});

if (allModelsValid) {
  console.log('✓ All 12 Mongoose models compiled and registered successfully!');
} else {
  console.error('✗ Some models failed registration!');
  process.exit(1);
}

// Start temporary test server and check health check endpoint
const server = app.listen(5001, async () => {
  console.log('[Test Server] Listening on port 5001');
  try {
    const res = await fetch('http://127.0.0.1:5001/api/v1/health');
    const data = await res.json();
    console.log('[Health Check Response]:', JSON.stringify(data));
    if (data.success && data.statusCode === 200) {
      console.log('✓ Health check endpoint /api/v1/health passed with status 200!');
    } else {
      throw new Error('Unexpected health response');
    }
  } catch (err) {
    console.error('Health check test failed:', err);
    process.exit(1);
  } finally {
    server.close(() => {
      console.log('✓ Phase 1 backend test completed successfully.');
      process.exit(0);
    });
  }
});
