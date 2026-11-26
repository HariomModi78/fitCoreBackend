import mongoose from 'mongoose';

const membershipPlanSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1'],
    },
    durationUnit: {
      type: String,
      enum: ['days', 'weeks', 'months', 'years'],
      default: 'months',
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: [0, 'Price cannot be negative'],
    },
    description: {
      type: String,
      trim: true,
    },
    features: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
    enrollmentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// 1. Fast lookup & sorting of plans by name within a gym. Without it: Scans plans collection to find plan by name.
membershipPlanSchema.index({ gymId: 1, name: 1 });

// 2. Active plan dropdowns (filters out archived plans). Without it: Full collection scan when populating plan selector dropdowns in modals.
membershipPlanSchema.index({ gymId: 1, status: 1 });

export const MembershipPlan = mongoose.model('MembershipPlan', membershipPlanSchema);
export default MembershipPlan;
