import mongoose from 'mongoose';

const gymSaaSSubscriptionSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SaaSPlan',
      required: true,
    },
    planNameSnapshot: {
      type: String,
      required: true,
    },
    durationSnapshot: {
      type: Number,
      required: true,
    },
    durationUnitSnapshot: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'expired', 'cancelled'],
      default: 'trial',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    paymentGateway: {
      type: String,
      default: 'razorpay',
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    purchasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// 1. Gym SaaS status check (verifies if gym's platform license is active/trial). Without it: Full collection scan on every SaaS middleware license check.
gymSaaSSubscriptionSchema.index({ gymId: 1, status: 1 });

// 2. SaaS expiration check: scans for gyms whose software subscription is ending. Without it: Slow scan across all SaaS subscriptions.
gymSaaSSubscriptionSchema.index({ gymId: 1, endDate: 1 });

export const GymSaaSSubscription = mongoose.model(
  'GymSaaSSubscription',
  gymSaaSSubscriptionSchema
);
export default GymSaaSSubscription;
