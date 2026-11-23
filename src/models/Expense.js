import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Expense title is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'rent',
        'electricity',
        'equipment',
        'maintenance',
        'staff_salary',
        'cleaning',
        'marketing',
        'other',
      ],
      default: 'other',
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    description: String,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByName: String,
  },
  { timestamps: true }
);

expenseSchema.index({ gymId: 1, date: 1 });

export const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
