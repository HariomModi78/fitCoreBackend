import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import Subscription from '../models/Subscription.js';
import Member from '../models/Member.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getFinancialReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const gymId = req.gymId;

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  const paymentQuery = { gymId, status: 'completed' };
  const expenseQuery = { gymId };

  if (startDate || endDate) {
    paymentQuery.paymentDate = dateFilter;
    expenseQuery.date = dateFilter;
  }

  const [payments, expenses, pendingSubs] = await Promise.all([
    Payment.find(paymentQuery),
    Expense.find(expenseQuery),
    Subscription.find({
      gymId,
      status: { $in: ['active', 'upcoming', 'expired'] },
      paymentStatus: { $in: ['unpaid', 'partially_paid'] },
    }).populate('memberId', 'name memberCode phone'),
  ]);

  const totalCollectedRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalRecordedExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netCashMovement = totalCollectedRevenue - totalRecordedExpenses;

  // Breakdown by payment method
  const paymentMethods = {};
  payments.forEach((p) => {
    paymentMethods[p.paymentMethod] = (paymentMethods[p.paymentMethod] || 0) + p.amount;
  });

  // Breakdown by expense category
  const expenseCategories = {};
  expenses.forEach((e) => {
    expenseCategories[e.category] = (expenseCategories[e.category] || 0) + e.amount;
  });

  // Outstanding dues
  const outstandingDuesList = pendingSubs.map((s) => ({
    memberId: s.memberId?._id,
    memberName: s.memberId?.name,
    memberCode: s.memberId?.memberCode,
    phone: s.memberId?.phone,
    planName: s.planNameSnapshot,
    payableAmount: s.payableAmount,
    amountPaid: s.amountPaid,
    dueAmount: Math.max(0, s.payableAmount - s.amountPaid),
  }));

  const totalOutstandingDues = outstandingDuesList.reduce(
    (sum, d) => sum + d.dueAmount,
    0
  );

  return ApiResponse.success(res, {
    summary: {
      totalCollectedRevenue,
      totalRecordedExpenses,
      netCashMovement,
      totalOutstandingDues,
      paymentCount: payments.length,
      expenseCount: expenses.length,
    },
    paymentMethods,
    expenseCategories,
    outstandingDuesList,
  });
});
