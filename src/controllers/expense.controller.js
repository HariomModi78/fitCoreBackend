import Expense from '../models/Expense.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getExpenses = asyncHandler(async (req, res) => {
  const { category, startDate, endDate } = req.query;
  const query = { gymId: req.gymId };

  if (category && category !== 'all') {
    query.category = category;
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const expenses = await Expense.find(query).sort({ date: -1 });

  // Summary calculations
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monthExpenses = expenses.filter((e) => new Date(e.date) >= startOfMonth);
  const todayExpenses = expenses.filter((e) => new Date(e.date) >= startOfDay);

  const totalMonth = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalToday = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown
  const categoryBreakdown = {};
  monthExpenses.forEach((e) => {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
  });

  return ApiResponse.success(res, {
    expenses,
    summary: {
      totalThisMonth: totalMonth,
      totalToday: totalToday,
      categoryBreakdown,
    },
  });
});

export const createExpense = asyncHandler(async (req, res) => {
  const { title, category, amount, date = new Date(), description } = req.body;

  if (!title || !amount) {
    throw ApiError.badRequest('Expense title and amount are required');
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    throw ApiError.badRequest('Expense amount must be greater than zero');
  }

  const expense = await Expense.create({
    gymId: req.gymId,
    title: title.trim(),
    category: category || 'other',
    amount: parsedAmount,
    date: new Date(date),
    description,
    recordedBy: req.user._id,
    recordedByName: req.user.name,
  });

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'EXPENSE_CREATE',
    details: {
      expenseId: expense._id,
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
    },
  });

  return ApiResponse.created(res, expense, 'Expense recorded successfully');
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete({
    _id: req.params.id,
    gymId: req.gymId,
  });

  if (!expense) throw ApiError.notFound('Expense not found');

  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'EXPENSE_DELETE',
    details: {
      expenseId: expense._id,
      title: expense.title,
      amount: expense.amount,
    },
  });

  return ApiResponse.success(res, null, 'Expense deleted successfully');
});
