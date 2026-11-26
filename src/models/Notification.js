import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
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
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    type: {
      type: String,
      enum: [
        'expiry_reminder',
        'due_reminder',
        'new_member',
        'payment_received',
        'subscription_renewed',
        'broadcast',
        'system',
      ],
      required: true,
    },
    targetAudience: {
      type: String,
      enum: ['all', 'active', 'expired', 'pending'],
      default: 'all',
    },
    category: {
      type: String,
      enum: ['general', 'holiday', 'offer', 'maintenance', 'emergency'],
      default: 'general',
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    daysLeft: {
      type: Number,
    },
    recipientPhone: {
      type: String,
    },
    whatsappUrl: {
      type: String,
    },
    whatsappStatus: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: { type: String, index: true },
      deliveryStatus: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending',
      },
      deliveredAt: Date,
      readAt: Date,
      error: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    deliveryStatus: {
      emailSent: { type: Boolean, default: false },
      emailError: String,
    },
    broadcastRecipients: [
      {
        memberId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Member',
        },
        name: String,
        phone: String,
        memberCode: String,
        whatsappUrl: String,
        messageId: { type: String, index: true },
        deliveryStatus: {
          type: String,
          enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
          default: 'pending',
        },
        dispatched: { type: Boolean, default: false },
        dispatchVia: String,
        error: String,
      },
    ],
  },
  { timestamps: true }
);

// 1. Notification Center Feed: loads latest alerts in reverse chronological order. Without it: Slow memory sort across notification records.
notificationSchema.index({ gymId: 1, createdAt: -1 });

// 2. Unread notification badge counter: fast count of isRead=false. Without it: Scans all historical notifications just to show the unread count badge.
notificationSchema.index({ gymId: 1, isRead: 1 });

// 3. Nightly Scheduler Deduplication: verifies if an alert for a subscription was already logged today. Without it: Nightly cron checks thousands of subscriptions with non-indexed scans.
notificationSchema.index({ gymId: 1, subscriptionId: 1, type: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
