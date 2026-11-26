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
        'STAFF_DELETE',
        'GYM_UPDATE',
        'BROADCAST_ALERT_SENT',
        'SAAS_SUBSCRIPTION_PURCHASE',
      ],
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

// 1. Audit Trail Feed: loads chronological system activity log (newest first). Without it: High-memory sort across all audit log events.
auditLogSchema.index({ gymId: 1, createdAt: -1 });

// 2. Action filter (e.g. filter by 'STAFF_INVITE', 'PAYMENT_RECORD', etc.). Without it: Scans all audit events sequentially to find action matches.
auditLogSchema.index({ gymId: 1, action: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
