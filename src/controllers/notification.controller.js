import Notification from '../models/Notification.js';
import Subscription from '../models/Subscription.js';
import Member from '../models/Member.js';
import Gym from '../models/Gym.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
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
    sent: dispatchResult?.success || false,
    sentAt: new Date(),
    messageId: dispatchResult?.messageId || null,
    deliveryStatus: dispatchResult?.success ? 'sent' : 'failed',
    error: dispatchResult?.error || null,
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

export const getBroadcastAudienceCount = asyncHandler(async (req, res) => {
  const { targetAudience = 'all' } = req.query;

  let totalMembers = 0;
  let membersWithPhone = 0;

  if (targetAudience === 'pending') {
    // Find active subscriptions with unpaid balance or due amount > 0
    const dueSubs = await Subscription.find({
      gymId: req.gymId,
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        { dueAmount: { $gt: 0 } },
      ],
    }).select('memberId');
    const memberIds = [...new Set(dueSubs.map((s) => String(s.memberId)))];
    totalMembers = await Member.countDocuments({
      _id: { $in: memberIds },
      gymId: req.gymId,
    });
    membersWithPhone = await Member.countDocuments({
      _id: { $in: memberIds },
      gymId: req.gymId,
      phone: { $exists: true, $ne: '' },
    });
  } else {
    const query = { gymId: req.gymId };
    if (targetAudience === 'active') {
      query.status = 'active';
    } else if (targetAudience === 'expired') {
      query.status = 'expired';
    }

    totalMembers = await Member.countDocuments(query);
    membersWithPhone = await Member.countDocuments({
      ...query,
      phone: { $exists: true, $ne: '' },
    });
  }

  return ApiResponse.success(res, {
    targetAudience,
    totalMembers,
    membersWithPhone,
  });
});

export const sendBroadcastAlert = asyncHandler(async (req, res) => {
  const { title, message, targetAudience = 'all', category = 'general' } = req.body;

  if (!title || !title.trim()) {
    throw ApiError.badRequest('Alert title is required');
  }
  if (!message || !message.trim()) {
    throw ApiError.badRequest('Alert message is required');
  }

  const gym = await Gym.findById(req.gymId);
  if (!gym) throw ApiError.notFound('Gym not found');

  // Verify SaaS status (checking both plan expiry and active trial)
  const now = new Date();
  const expiresAt = gym.saasExpiresAt ? new Date(gym.saasExpiresAt) : null;
  const trialEndsAt = gym.trialEndsAt ? new Date(gym.trialEndsAt) : null;
  const hasValidExpiresAt = expiresAt && now <= expiresAt;
  const hasValidTrial = (gym.saasStatus === 'trial' || !expiresAt) && trialEndsAt && now <= trialEndsAt;
  const isExpired = !hasValidExpiresAt && !hasValidTrial;

  if (isExpired && !req.user?.isSuperAdmin) {
    return ApiResponse.paymentRequired(
      res,
      'Your FitCore gym subscription has expired. Please renew your plan to send member broadcasts.'
    );
  }

  // Multi-tenant check: Query ONLY members belonging to THIS gym!
  let members = [];
  if (targetAudience === 'pending') {
    const dueSubs = await Subscription.find({
      gymId: req.gymId,
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        { dueAmount: { $gt: 0 } },
      ],
    }).select('memberId');
    const memberIds = [...new Set(dueSubs.map((s) => String(s.memberId)))];
    members = await Member.find({
      _id: { $in: memberIds },
      gymId: req.gymId,
    }).select('_id name phone memberCode status');
  } else {
    const query = { gymId: req.gymId };
    if (targetAudience === 'active') {
      query.status = 'active';
    } else if (targetAudience === 'expired') {
      query.status = 'expired';
    }
    members = await Member.find(query).select('_id name phone memberCode status');
  }

  if (members.length === 0) {
    throw ApiError.badRequest(
      `No members found in your gym matching audience: "${targetAudience}".`
    );
  }

  // Format Broadcast Message with Gym Branding
  const formattedMessage = `📢 *Announcement from ${gym.name}*\n\n*${title.trim()}*\n\n${message.trim()}\n\n— Team ${gym.name} ${gym.phone ? `(${gym.phone})` : ''}`;

  // Process WhatsApp dispatch for each member with a phone
  let sentDirectCount = 0;
  const recipientQueue = [];
  const memberNotificationDocs = [];

  for (const m of members) {
    const personalMsg = `Hi ${m.name}!\n\n${formattedMessage}`;
    const waUrl = m.phone ? generateWhatsAppUrl(m.phone, personalMsg) : null;

    let dispatchResult = { success: false, via: 'direct_link', waUrl };
    if (m.phone) {
      try {
        dispatchResult = await dispatchWhatsAppMessage({
          phone: m.phone,
          text: personalMsg,
        });
        if (dispatchResult?.success && dispatchResult.via !== 'direct_link') {
          sentDirectCount++;
        }
      } catch (err) {
        console.warn(`[Broadcast WhatsApp Error for ${m.phone}]:`, err.message);
        dispatchResult = { success: false, via: 'error', error: err.message, waUrl };
      }
    }

    const wasDispatched = Boolean(dispatchResult?.success && dispatchResult.via !== 'direct_link');

    recipientQueue.push({
      memberId: m._id,
      name: m.name,
      phone: m.phone || '',
      memberCode: m.memberCode || '',
      status: m.status || '',
      whatsappUrl: waUrl,
      messageId: dispatchResult?.messageId || null,
      deliveryStatus: wasDispatched ? 'sent' : 'pending',
      dispatched: wasDispatched,
      dispatchVia: dispatchResult?.via || (m.phone ? 'direct_link' : 'no_phone'),
      error: dispatchResult?.error || null,
    });

    // Prepare individual member notification document
    memberNotificationDocs.push({
      gymId: req.gymId,
      memberId: m._id,
      type: 'broadcast',
      title: `📢 ${title.trim()}`,
      message: personalMsg,
      category,
      targetAudience,
      recipientPhone: m.phone || null,
      whatsappUrl: waUrl,
      whatsappStatus: {
        sent: wasDispatched,
        sentAt: wasDispatched ? new Date() : null,
        messageId: dispatchResult?.messageId || null,
        deliveryStatus: wasDispatched ? 'sent' : 'pending',
        error: dispatchResult?.error || null,
      },
      isRead: false,
    });
  }

  // Insert individual notifications for members so each member's history is recorded
  if (memberNotificationDocs.length > 0) {
    try {
      await Notification.insertMany(memberNotificationDocs);
    } catch (insertErr) {
      console.warn('[Broadcast Notification Insert Error]:', insertErr.message);
    }
  }

  // Create the parent broadcast summary record for the gym
  const broadcastRecord = await Notification.create({
    gymId: req.gymId,
    type: 'broadcast',
    title: `📢 ${title.trim()}`,
    message: formattedMessage,
    targetAudience,
    category,
    recipientCount: members.length,
    broadcastRecipients: recipientQueue,
    whatsappStatus: {
      sent: sentDirectCount > 0,
      sentAt: sentDirectCount > 0 ? new Date() : null,
    },
    isRead: false,
  });

  // Audit Log
  await AuditLog.create({
    gymId: req.gymId,
    userId: req.user._id,
    action: 'BROADCAST_ALERT_SENT',
    details: {
      broadcastId: broadcastRecord._id,
      title: title.trim(),
      targetAudience,
      category,
      totalRecipients: members.length,
      phoneCount: recipientQueue.filter((r) => !!r.phone).length,
      sentDirectCount,
    },
  });

  return ApiResponse.created(
    res,
    {
      broadcast: broadcastRecord,
      totalRecipients: members.length,
      membersWithPhone: recipientQueue.filter((r) => !!r.phone).length,
      sentDirectCount,
      recipientQueue,
    },
    sentDirectCount > 0
      ? `Broadcast sent: ${sentDirectCount} delivered directly via WhatsApp API.`
      : `Broadcast logged for ${members.length} member(s). Ready for WhatsApp dispatch.`
  );
});

export const sendBroadcastMemberWhatsApp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { memberId } = req.body;

  const broadcast = await Notification.findOne({ _id: id, gymId: req.gymId });
  if (!broadcast) {
    return ApiResponse.notFound(res, 'Broadcast notification not found');
  }

  const recipient = broadcast.broadcastRecipients?.find(
    (r) => String(r.memberId) === String(memberId)
  );

  if (!recipient) {
    return ApiResponse.notFound(res, 'Member not found in this broadcast');
  }

  if (!recipient.phone) {
    return ApiResponse.error(res, 'Recipient has no phone number on record');
  }

  const personalMsg = `Hi ${recipient.name}!\n\n${broadcast.message}`;
  const dispatchResult = await dispatchWhatsAppMessage({
    phone: recipient.phone,
    text: personalMsg,
  });

  recipient.dispatched = true;
  recipient.messageId = dispatchResult?.messageId || null;
  recipient.deliveryStatus = dispatchResult?.success ? 'sent' : 'failed';
  recipient.dispatchVia = dispatchResult?.via;
  recipient.error = dispatchResult?.error || null;
  await broadcast.save();

  // Also mark member's notification
  await Notification.updateOne(
    { gymId: req.gymId, memberId, type: 'broadcast', title: broadcast.title },
    {
      $set: {
        'whatsappStatus.sent': true,
        'whatsappStatus.sentAt': new Date(),
        'whatsappStatus.messageId': dispatchResult?.messageId || null,
        'whatsappStatus.deliveryStatus': dispatchResult?.success ? 'sent' : 'failed',
        isRead: true,
      },
    }
  );

  return ApiResponse.success(
    res,
    {
      recipient,
      dispatchResult,
      whatsappUrl: recipient.whatsappUrl,
    },
    'WhatsApp message link generated & marked as sent'
  );
});
