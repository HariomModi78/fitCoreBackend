import mongoose from 'mongoose';

const saasPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      required: true,
      default: 1,
    },
    durationUnit: {
      type: String,
      enum: ['days', 'months', 'years'],
      default: 'months',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      default: '',
    },
    features: {
      type: [String],
      default: [
        'Unlimited Gym Members',
        'Automated WhatsApp Expiry Alerts',
        'Payment Receipts & Dues Tracking',
        'Expense Tracking & Net Cash Flow',
        'Staff Roles & Permissions',
        'Dashboard & Real-time Analytics',
      ],
    },
    badge: {
      type: String,
      default: '', // e.g. 'Most Popular', 'Best Value'
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const SaaSPlan = mongoose.model('SaaSPlan', saasPlanSchema);
export default SaaSPlan;
