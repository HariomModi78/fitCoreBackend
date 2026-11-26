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
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    date: {
      type: Date,
      default: Date.now,
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

// 1. Lists all gym expenses sorted by newest date first. Without it: Full collection scan + memory sort on Expenses page.
expenseSchema.index({ gymId: 1, date: -1 });

// 2. Filters expenses by category (Rent, Electricity, Maintenance) sorted by date. Without it: Scans all expenses then filters in memory.
expenseSchema.index({ gymId: 1, category: 1, date: -1 });

export const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
