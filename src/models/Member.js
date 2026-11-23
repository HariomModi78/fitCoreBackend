import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    memberCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, 'Member name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    dateOfBirth: Date,
    emergencyContact: {
      name: String,
      phone: String,
      relation: String,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    avatar: String,
    notes: String,
    status: {
      type: String,
      enum: ['active', 'expired', 'upcoming', 'archived'],
      default: 'upcoming',
      index: true,
    },
    currentSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    dueAmount: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true }
);

// Member code must be unique per gym
memberSchema.index({ gymId: 1, memberCode: 1 }, { unique: true });
memberSchema.index({ gymId: 1, phone: 1 });
memberSchema.index({ gymId: 1, dueAmount: -1 });
memberSchema.index({ gymId: 1, name: 'text', memberCode: 'text' });

export const Member = mongoose.model('Member', memberSchema);
export default Member;
