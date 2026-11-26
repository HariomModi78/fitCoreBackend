import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
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
    },
    currentSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    dueAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// 1. Enforces unique memberCode per gym. Without it: duplicate codes like FG-0001 could be assigned to multiple members.
memberSchema.index({ gymId: 1, memberCode: 1 }, { unique: true });

// 2. Fast search by phone number (e.g. member lookup / check-in). Without it: Full collection scan (COLLSCAN) on every phone query.
memberSchema.index({ gymId: 1, phone: 1 });

// 3. Fast retrieval of recent members sorted by newest first. Without it: Slow in-memory RAM sort (COLLSCAN + SORT).
memberSchema.index({ gymId: 1, createdAt: -1 });

// 4. Tab filtering (Active, Expired, Upcoming) sorted by newest first (ESR Rule). Without it: MongoDB hits 32MB in-memory sort limit and crashes at scale.
memberSchema.index({ gymId: 1, status: 1, createdAt: -1 });

// 5. Outstanding dues ranking (highest debtor at top). Without it: Scans all members to sort by due amount.
memberSchema.index({ gymId: 1, dueAmount: -1 });

// 6. Text search across name and member code. Without it: Regex full table scan across all member documents.
memberSchema.index({ gymId: 1, name: 'text', memberCode: 'text' });

export const Member = mongoose.model('Member', memberSchema);
export default Member;
