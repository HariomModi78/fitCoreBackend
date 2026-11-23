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
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
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

export const GymSaaSSubscription = mongoose.model(
  'GymSaaSSubscription',
  gymSaaSSubscriptionSchema
);
export default GymSaaSSubscription;
