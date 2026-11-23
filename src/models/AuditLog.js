import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'MEMBER_CREATE',
        'MEMBER_UPDATE',
        'MEMBER_ARCHIVE',
        'SUBSCRIPTION_CREATE',
        'SUBSCRIPTION_RENEW',
        'SUBSCRIPTION_CANCEL',
        'PAYMENT_RECORD',
        'PAYMENT_REFUND',
        'EXPENSE_CREATE',
        'EXPENSE_DELETE',
        'STAFF_INVITE',
        'STAFF_PERMISSION_CHANGE',
        'GYM_UPDATE',
      ],
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true }
);

auditLogSchema.index({ gymId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
