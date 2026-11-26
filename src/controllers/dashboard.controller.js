import Member from '../models/Member.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import MembershipPlan from '../models/MembershipPlan.js';
import AuditLog from '../models/AuditLog.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const gymId = req.gymId;
  const now = new Date();
  const range = (req.query.range || 'this_month').toLowerCase();

  // Determine if the user has permission to view gym financials/revenue
  const canViewFinancials =
    req.user?.isSuperAdmin === true ||
    req.gymRole === 'owner' ||
    (Array.isArray(req.permissions) &&
      (req.permissions.includes('view_reports') || req.permissions.includes('view_payments')));

  let startDate, endDate, prevStartDate, prevEndDate;
  let chartBuckets = [];

  if (range === 'this_week') {
    // Current Week (Monday to Sunday)
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diffToMonday));
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    prevStartDate = new Date(startDate);
    prevStartDate.setDate(startDate.getDate() - 7);
    prevEndDate = new Date(endDate);
    prevEndDate.setDate(endDate.getDate() - 7);

    chartBuckets = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => ({
      name: dayName,
      revenue: 0,
    }));
  } else if (range === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
    prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);

    chartBuckets = [
      { name: 'Week 1', revenue: 0 },
      { name: 'Week 2', revenue: 0 },
      { name: 'Week 3', revenue: 0 },
      { name: 'Week 4', revenue: 0 },
    ];
  } else if (range === 'this_year') {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    prevStartDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0);
    prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    chartBuckets = monthNames.map((m) => ({ name: m, revenue: 0 }));
  } else {
    // Default: 'this_month'
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    chartBuckets = [
      { name: 'Week 1', revenue: 0 },
      { name: 'Week 2', revenue: 0 },
      { name: 'Week 3', revenue: 0 },
      { name: 'Week 4', revenue: 0 },
    ];
  }

  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. Core Summary Metrics (Financial payment queries only execute if authorized)
  const summaryQueries = [
    Member.countDocuments({ gymId, status: { $ne: 'archived' } }),
    Member.countDocuments({ gymId, status: 'active' }),
    Member.countDocuments({ gymId, status: 'expired' }),
    Member.countDocuments({ gymId, status: 'upcoming' }),
    Subscription.countDocuments({
      gymId,
      status: 'active',
      endDate: { $gte: now, $lte: sevenDaysFromNow },
    }),
  ];

  if (canViewFinancials) {
    summaryQueries.push(
      Payment.find({
        gymId,
        status: 'completed',
        paymentDate: { $gte: startDate, $lte: endDate },
      }),
      Payment.find({
        gymId,
        status: 'completed',
        paymentDate: { $gte: prevStartDate, $lte: prevEndDate },
      })
    );
  }

  const queryResults = await Promise.all(summaryQueries);
  const totalMembers = queryResults[0];
  const activeMembers = queryResults[1];
  const expiredMembers = queryResults[2];
  const pendingMembers = queryResults[3];
  const upcomingRenewals = queryResults[4];
  const currentPayments = canViewFinancials ? queryResults[5] || [] : [];
  const previousPayments = canViewFinancials ? queryResults[6] || [] : [];

  let revenueThisPeriod = null;
  let revenueGrowthPct = null;

  if (canViewFinancials) {
    revenueThisPeriod = currentPayments.reduce((sum, p) => sum + p.amount, 0);
    const revenuePrevPeriod = previousPayments.reduce((sum, p) => sum + p.amount, 0);

    if (revenuePrevPeriod > 0) {
      revenueGrowthPct = Math.round(((revenueThisPeriod - revenuePrevPeriod) / revenuePrevPeriod) * 100);
    } else if (revenueThisPeriod > 0) {
      revenueGrowthPct = 100;
    } else {
      revenueGrowthPct = 0;
    }

    // Aggregate Payments into chartBuckets
    if (range === 'this_week') {
      currentPayments.forEach((p) => {
        const pDay = new Date(p.paymentDate).getDay();
        const idx = pDay === 0 ? 6 : pDay - 1;
        if (chartBuckets[idx]) chartBuckets[idx].revenue += p.amount;
      });
    } else if (range === 'this_year') {
      currentPayments.forEach((p) => {
        const pMonth = new Date(p.paymentDate).getMonth();
        if (chartBuckets[pMonth]) chartBuckets[pMonth].revenue += p.amount;
      });
    } else {
      currentPayments.forEach((p) => {
        const dateNum = new Date(p.paymentDate).getDate();
        if (dateNum <= 7) chartBuckets[0].revenue += p.amount;
        else if (dateNum <= 14) chartBuckets[1].revenue += p.amount;
        else if (dateNum <= 21) chartBuckets[2].revenue += p.amount;
        else chartBuckets[3].revenue += p.amount;
      });
    }
  } else {
    chartBuckets = [];
  }

  // 2. Membership Status Breakdown (100% real database counts)
  const statusBreakdown = [
    { name: 'Active', value: activeMembers, color: '#10B981' },
    { name: 'Expired', value: expiredMembers, color: '#FF7A00' },
    { name: 'Pending', value: pendingMembers, color: '#D1D5DB' },
  ];

  // 3. Popular Membership Plans with Percentages
  const plans = await MembershipPlan.find({ gymId, status: { $ne: 'archived' } });
  const allSubscriptionsCount = await Subscription.countDocuments({ gymId });

  const popularPlans = await Promise.all(
    plans.map(async (plan) => {
      const enrollments = await Subscription.countDocuments({
        gymId,
        planId: plan._id,
      });
      const percentage =
        allSubscriptionsCount > 0
          ? Math.round((enrollments / allSubscriptionsCount) * 100)
          : 0;

      return {
        id: plan._id,
        name: plan.name,
        price: canViewFinancials ? plan.price : null,
        duration: plan.duration,
        durationUnit: plan.durationUnit,
        enrollments,
        percentage,
      };
    })
  );

  popularPlans.sort((a, b) => b.enrollments - a.enrollments);

  // 4. Recent Activities (sanitized for unauthorized staff)
  const auditLogs = await AuditLog.find({ gymId })
    .sort({ createdAt: -1 })
    .limit(10);

  let formattedActivities = [];

  for (const log of auditLogs) {
    if (log.action === 'EXPENSE_CREATE' && !canViewFinancials) {
      continue;
    }

    let title = 'Gym Activity';
    let detail = '';

    if (log.action === 'MEMBER_CREATE') {
      title = 'New member registered';
      detail = log.details?.name ? `${log.details.name} (${log.details.memberCode || ''})` : 'New Member';
    } else if (log.action === 'PAYMENT_RECORD') {
      title = 'Payment received';
      detail = canViewFinancials
        ? `₹${(log.details?.amount || 0).toLocaleString()} • ${log.details?.receiptNumber || 'Receipt'}`
        : `Payment processed • ${log.details?.receiptNumber || 'Receipt'}`;
    } else if (log.action === 'SUBSCRIPTION_RENEW') {
      title = 'Membership renewed';
      detail = log.details?.planName || 'Plan Renewed';
    } else if (log.action === 'SUBSCRIPTION_CREATE') {
      title = 'Membership assigned';
      detail = log.details?.planName || 'New Plan';
    } else if (log.action === 'EXPENSE_CREATE') {
      title = 'Expense logged';
      detail = `${log.details?.title || 'Expense'} (₹${log.details?.amount || 0})`;
    }

    formattedActivities.push({
      id: log._id,
      title,
      detail,
      time: log.createdAt,
    });

    if (formattedActivities.length >= 5) break;
  }

  // If auditLogs are sparse and user is authorized, supplement with payments/members
  if (formattedActivities.length < 3) {
    const recentMembers = await Member.find({ gymId, status: { $ne: 'archived' } })
      .sort({ createdAt: -1 })
      .limit(3);

    recentMembers.forEach((m) => {
      formattedActivities.push({
        id: m._id,
        title: 'New member registered',
        detail: `${m.name} (${m.memberCode || 'Member'})`,
        time: m.createdAt,
      });
    });

    formattedActivities.sort((a, b) => new Date(b.time) - new Date(a.time));
    formattedActivities = formattedActivities.slice(0, 5);
  }

  return ApiResponse.success(res, {
    canViewFinancials,
    metrics: {
      totalMembers,
      activeMembers,
      expiredMembers,
      pendingMembers,
      upcomingRenewals,
      revenueThisPeriod,
      revenueGrowthPct,
      range,
    },
    revenueChart: chartBuckets,
    statusBreakdown,
    popularPlans: popularPlans.slice(0, 4),
    recentActivities: formattedActivities,
  });
});
