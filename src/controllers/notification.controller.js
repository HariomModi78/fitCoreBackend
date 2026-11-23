import Notification from '../models/Notification.js';
import Subscription from '../models/Subscription.js';
import Member from '../models/Member.js';
import Gym from '../models/Gym.js';
import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  generateWhatsAppExpiryMessage,
  generateWhatsAppUrl,
  dispatchWhatsAppMessage,
} from '../utils/whatsappService.js';

// Core expiry checking and reminder generation engine
export const runExpiryScan = async (gymId) => {
  const gym = await Gym.findById(gymId);
  if (!gym) return { checked: 0, created: 0 };

  // Check SaaS subscription: if gym's FitCore license is expired, block member alerts!
  const now = new Date();
  const isSaaSExpired = !gym.saasExpiresAt || now > new Date(gym.saasExpiresAt);
  if (isSaaSExpired) {
    if (gym.saasStatus !== 'expired') {
      gym.saasStatus = 'expired';
      await gym.save();
    }
    console.warn(`[SaaS Block]: Gym "${gym.name}" FitCore license is expired. Halting WhatsApp alerts.`);
    return { checked: 0, created: 0, blockedReason: 'SAAS_EXPIRED' };
  }

  const reminderDays =
    gym.settings?.expiryReminderDays?.length > 0
      ? gym.settings.expiryReminderDays
      : [5, 0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Active subscriptions with member populated
  const activeSubs = await Subscription.find({
    gymId,
    status: 'active',
  }).populate('memberId');

  let createdCount = 0;

  for (const sub of activeSubs) {
    if (!sub.memberId || !sub.endDate) continue;

    const endDate = new Date(sub.endDate);
    endDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // If diffDays matches any configured reminder threshold (e.g. 5 days, 0 days)
    if (reminderDays.includes(diffDays)) {
      // Check if notification already logged today for this subscription and threshold
      const existingNotif = await Notification.findOne({
        gymId,
        subscriptionId: sub._id,
        daysLeft: diffDays,
        type: 'expiry_reminder',
        createdAt: { $gte: today },
      });

      if (!existingNotif) {
        const isExpiryDay = diffDays === 0;
        const template = isExpiryDay
          ? gym.settings?.whatsappSettings?.customTemplateOnExpiry
          : gym.settings?.whatsappSettings?.customTemplateBefore;

        const messageText = generateWhatsAppExpiryMessage({
          template,
          memberName: sub.memberId.name,
          planName: sub.planNameSnapshot || 'Gym Membership',
          daysLeft: diffDays,
          expiryDate: sub.endDate,
          gymName: gym.name,
          gymPhone: gym.phone,
        });

        const whatsappUrl = sub.memberId.phone
          ? generateWhatsAppUrl(sub.memberId.phone, messageText)
          : '';

        const title = isExpiryDay
          ? `🚨 Expiry Alert: ${sub.memberId.name}'s plan expires TODAY!`
          : `⚠️ Expiry Warning: ${sub.memberId.name} expires in ${diffDays} day(s)`;

        await Notification.create({
          gymId,
          memberId: sub.memberId._id,
          subscriptionId: sub._id,
          type: 'expiry_reminder',
          title,
          message: messageText,
          daysLeft: diffDays,
          recipientPhone: sub.memberId.phone,
          whatsappUrl,
          whatsappStatus: {
            sent: false,
          },
        });

        createdCount++;
      }
    }
  }

  // Scan for pending dues whose scheduled reminder date has arrived
  const dueSubs = await Subscription.find({
    gymId,
    status: 'active',
    paymentStatus: 'partially_paid',
    dueReminderDate: { $lte: new Date() },
  }).populate('memberId');

  for (const dueSub of dueSubs) {
    if (!dueSub.memberId) continue;
    const dueAmount = Math.max(0, (dueSub.payableAmount || 0) - (dueSub.amountPaid || 0));
    if (dueAmount <= 0) continue;

    const existingDueNotif = await Notification.findOne({
      gymId,
      subscriptionId: dueSub._id,
      type: 'due_reminder',
      createdAt: { $gte: today },
    });

    if (!existingDueNotif) {
      const dueMessage = `Hi ${dueSub.memberId.name}, gentle reminder from ${gym.name}. You have an outstanding balance of ₹${dueAmount.toLocaleString()} towards your ${dueSub.planNameSnapshot || 'Gym'} membership. Please clear it at the front desk or via UPI. Contact: ${gym.phone || ''}. FitCore - Stronger Together.`;
      const whatsappUrl = dueSub.memberId.phone
        ? generateWhatsAppUrl(dueSub.memberId.phone, dueMessage)
        : '';

      await Notification.create({
        gymId,
        memberId: dueSub.memberId._id,
        subscriptionId: dueSub._id,
        type: 'due_reminder',
        title: `💰 Pending Due Reminder: ${dueSub.memberId.name} (₹${dueAmount.toLocaleString()})`,
        message: dueMessage,
        recipientPhone: dueSub.memberId.phone,
        whatsappUrl,
        whatsappStatus: {
          sent: false,
        },
      });
      createdCount++;
    }
  }

  return { checked: activeSubs.length + dueSubs.length, created: createdCount };
};

export const getNotifications = asyncHandler(async (req, res) => {
  const gymId = req.gymId;

  // Run expiry scan on demand to ensure real-time alert state
  await runExpiryScan(gymId);

  const notifications = await Notification.find({ gymId })
    .populate('memberId', 'name phone memberCode avatar')
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({ gymId, isRead: false });

  return ApiResponse.success(res, { notifications, unreadCount });
});

export const triggerExpiryCheck = asyncHandler(async (req, res) => {
  const result = await runExpiryScan(req.gymId);
  return ApiResponse.success(
    res,
    result,
    `Scan completed: Checked ${result.checked} subscriptions, generated ${result.created} new alerts.`
  );
});

export const markAsRead = asyncHandler(async (req, res) => {
  if (req.params.id === 'all') {
    await Notification.updateMany({ gymId: req.gymId, isRead: false }, { isRead: true });
    return ApiResponse.success(res, null, 'All notifications marked as read');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, gymId: req.gymId },
    { isRead: true },
    { new: true }
  );

  return ApiResponse.success(res, notification, 'Notification marked as read');
});

export const sendWhatsAppNotification = asyncHandler(async (req, res) => {
  const gym = await Gym.findById(req.gymId);
  const now = new Date();
  if (!gym?.saasExpiresAt || now > new Date(gym.saasExpiresAt)) {
    return ApiResponse.paymentRequired(
      res,
      'Your FitCore gym subscription has expired. WhatsApp alerts to members are suspended until your plan is renewed.'
    );
  }

  const { id } = req.params;
  const notification = await Notification.findOne({ _id: id, gymId: req.gymId });

  if (!notification) {
    return ApiResponse.notFound(res, 'Notification not found');
  }

  if (!notification.recipientPhone) {
    return ApiResponse.error(res, 'Recipient phone number not found on this member');
  }

  const dispatchResult = await dispatchWhatsAppMessage({
    phone: notification.recipientPhone,
    text: notification.message,
  });

  notification.whatsappStatus = {
    sent: true,
    sentAt: new Date(),
  };
  notification.isRead = true;
  await notification.save();

  return ApiResponse.success(
    res,
    {
      notification,
      whatsappUrl: notification.whatsappUrl,
      dispatchResult,
    },
    'WhatsApp message link generated & marked as sent'
  );
});

export const getMemberRenewalWhatsAppLink = asyncHandler(async (req, res) => {
  const { memberId } = req.params;
  const { type } = req.query; // 'due' or 'expiry'
  const gym = await Gym.findById(req.gymId);

  const now = new Date();
  if (!gym?.saasExpiresAt || now > new Date(gym.saasExpiresAt)) {
    return ApiResponse.paymentRequired(
      res,
      'Your FitCore gym subscription has expired. WhatsApp alerts are suspended until your plan is renewed.'
    );
  }

  const member = await Member.findOne({ _id: memberId, gymId: req.gymId });

  if (!member) {
    return ApiResponse.notFound(res, 'Member not found');
  }

  if (!member.phone) {
    return ApiResponse.error(res, 'Member has no phone number on record');
  }

  const activeSub = await Subscription.findOne({
    gymId: req.gymId,
    memberId: member._id,
  }).sort({ createdAt: -1 });

  // Handle Due Reminder WhatsApp Message
  if (type === 'due') {
    const pendingDue = Math.max(
      0,
      (activeSub?.payableAmount || 0) - (activeSub?.amountPaid || 0)
    );
    const dueNotes = activeSub?.dueReminderNotes ? ` (Promised: ${activeSub.dueReminderNotes})` : '';
    const text = `Hi ${member.name}, gentle reminder from ${gym.name}. You have an outstanding balance of ₹${pendingDue.toLocaleString()} towards your ${activeSub?.planNameSnapshot || 'Gym'} membership${dueNotes}. Please clear it at your earliest convenience to keep your workout streak going! Contact: ${gym.phone || ''}. FitCore - Stronger Together.`;
    const whatsappUrl = generateWhatsAppUrl(member.phone, text);

    return ApiResponse.success(res, { whatsappUrl, text, phone: member.phone, pendingDue });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysLeft = 0;
  if (activeSub?.endDate) {
    const end = new Date(activeSub.endDate);
    end.setHours(0, 0, 0, 0);
    daysLeft = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const isExpiryDay = daysLeft <= 0;
  const template = isExpiryDay
    ? gym.settings?.whatsappSettings?.customTemplateOnExpiry
    : gym.settings?.whatsappSettings?.customTemplateBefore;

  const text = generateWhatsAppExpiryMessage({
    template,
    memberName: member.name,
    planName: activeSub?.planNameSnapshot || 'Membership',
    daysLeft: Math.max(0, daysLeft),
    expiryDate: activeSub?.endDate,
    gymName: gym.name,
    gymPhone: gym.phone,
  });

  const whatsappUrl = generateWhatsAppUrl(member.phone, text);

  return ApiResponse.success(res, { whatsappUrl, text, phone: member.phone });
});
