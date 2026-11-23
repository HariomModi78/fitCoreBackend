import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
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
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true,
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
      index: true,
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

paymentSchema.index({ gymId: 1, receiptNumber: 1 }, { unique: true });
paymentSchema.index({ gymId: 1, paymentDate: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
