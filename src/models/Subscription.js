import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
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
    status: {
      type: String,
      enum: ['upcoming', 'active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'overpaid', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    dueReminderDays: {
      type: Number,
      default: null,
    },
    dueReminderDate: {
      type: Date,
      default: null,
      index: true,
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

subscriptionSchema.index({ gymId: 1, status: 1 });
subscriptionSchema.index({ gymId: 1, endDate: 1 });
subscriptionSchema.index({ gymId: 1, dueAmount: -1 });

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
