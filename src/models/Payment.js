import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
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
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
    },
    receiptNumber: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    amountPaidSnapshot: {
      type: Number,
    },
    remainingBalanceSnapshot: {
      type: Number,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'upi', 'card', 'bank_transfer', 'other'],
      required: true,
    },
    transactionReference: {
      type: String,
      trim: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByName: {
      type: String,
    },
    status: {
      type: String,
      enum: ['completed', 'refunded', 'partial_refunded'],
      default: 'completed',
    },
    notes: String,
  },
  { timestamps: true }
);

// 1. Enforces unique receipt numbers per gym (e.g. REC-00001). Without it: Concurrent payments could produce duplicate receipt numbers.
paymentSchema.index({ gymId: 1, receiptNumber: 1 }, { unique: true });

// 2. Payments Ledger: lists all gym transactions in reverse chronological order. Without it: High-latency in-memory sort on every payment report view.
paymentSchema.index({ gymId: 1, paymentDate: -1, createdAt: -1 });

// 3. Member Payment History: shows all transactions made by a specific member. Without it: Scans entire gym payment collection to find one member's receipts.
paymentSchema.index({ gymId: 1, memberId: 1, paymentDate: -1 });

// 4. Historical Receipt Snapshot Generator: fetches chronological payments for a subscription to compute exact balance at receipt time. Without it: Slow non-indexed lookup per receipt download.
paymentSchema.index({ subscriptionId: 1, createdAt: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
