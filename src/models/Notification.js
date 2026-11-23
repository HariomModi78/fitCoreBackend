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
        'system',
      ],
      required: true,
      index: true,
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
      error: String,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    deliveryStatus: {
      emailSent: { type: Boolean, default: false },
      emailError: String,
    },
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
