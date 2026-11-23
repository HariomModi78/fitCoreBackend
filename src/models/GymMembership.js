import mongoose from 'mongoose';

const gymMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'staff'],
      default: 'staff',
    },
    permissions: {
      type: [String],
      enum: [
        'manage_members',
        'view_members',
        'manage_memberships',
        'record_payments',
        'view_payments',
        'view_reports',
        'manage_expenses',
      ],
      default: ['view_members', 'manage_memberships', 'record_payments'],
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'active',
    },
    joinedDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Ensure a user can only have one membership per gym
gymMembershipSchema.index({ userId: 1, gymId: 1 }, { unique: true });

export const GymMembership = mongoose.model('GymMembership', gymMembershipSchema);
export default GymMembership;
