import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembershipPlan',
      required: true,
    },
    // Historical Snapshots - prevent alteration if plan is modified later
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
    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountReason: String,
    payableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'expired', 'cancelled'],
      default: 'active',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'overpaid', 'refunded'],
      default: 'unpaid',
    },
    dueReminderDays: {
      type: Number,
      default: null,
    },
    dueReminderDate: {
      type: Date,
      default: null,
    },
    dueReminderNotes: {
      type: String,
      default: '',
    },
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// 1. Fetches a member's subscription history & current active plan (newest first). Without it: Scans entire subscriptions collection per member.
subscriptionSchema.index({ gymId: 1, memberId: 1, createdAt: -1 });

// 2. Automated Expiry Scanner: detects plans expiring today or in N days. Without it: Daily midnight cron job has to scan every single subscription in the gym.
subscriptionSchema.index({ gymId: 1, status: 1, endDate: 1 });

// 3. Automated Due Reminder Scanner: detects pending dues on or after promised date. Without it: Nightly scheduler does slow unindexed scan across all active subs.
subscriptionSchema.index({ gymId: 1, status: 1, dueReminderDate: 1 });

// 4. Outstanding dues ledger sorting (highest unpaid dues first). Without it: Slow in-memory sort on financial reports.
subscriptionSchema.index({ gymId: 1, dueAmount: -1 });

// 5. Filters by payment status (unpaid, partially_paid, paid, overpaid). Without it: Full collection scan when viewing paid vs unpaid accounts.
subscriptionSchema.index({ gymId: 1, paymentStatus: 1 });

// Automatic calculation hook: guarantees dueAmount & paymentStatus consistency
subscriptionSchema.pre('save', function (next) {
  const payable = this.payableAmount || 0;
  const paid = this.amountPaid || 0;
  this.dueAmount = payable - paid; // Negative = Advance payment / overpaid credit

  if (this.dueAmount < 0) {
    this.paymentStatus = 'overpaid'; // Advance payment
  } else if (this.dueAmount === 0 && payable > 0) {
    this.paymentStatus = 'paid';
  } else if (paid > 0) {
    this.paymentStatus = 'partially_paid';
  } else {
    this.paymentStatus = 'unpaid';
  }
  next();
});

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
