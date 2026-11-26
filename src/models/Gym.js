import mongoose from 'mongoose';

const gymSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Gym name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Gym slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    logo: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: 'India' },
    },
    currency: {
      code: { type: String, default: 'INR' },
      symbol: { type: String, default: '₹' },
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'trial'],
      default: 'trial',
    },
    settings: {
      acceptedPaymentMethods: {
        type: [String],
        default: ['cash', 'upi', 'card', 'bank_transfer'],
      },
      expiryReminderDays: {
        type: [Number],
        default: [5, 0], // e.g. 5 days before and on expiry (0 days)
      },
      whatsappSettings: {
        enabled: { type: Boolean, default: true },
        customTemplateBefore: {
          type: String,
          default:
            'Hi {memberName}, this is a gentle reminder from {gymName}. Your {planName} membership is expiring in {daysLeft} day(s) on {expiryDate}. Renew now to keep your workout streak uninterrupted! Contact: {gymPhone}. FitCore - Stronger Together.',
        },
        customTemplateOnExpiry: {
          type: String,
          default:
            'Hi {memberName}, your {planName} membership at {gymName} expires TODAY ({expiryDate}). Please renew today at the gym desk or online to avoid interruption. Contact: {gymPhone}. FitCore - Stronger Together.',
        },
      },
      memberCodePrefix: {
        type: String,
        default: 'FG',
      },
      nextMemberNumber: {
        type: Number,
        default: 1,
      },
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    saasStatus: {
      type: String,
      enum: ['trial', 'active', 'expired', 'suspended'],
      default: 'trial',
      index: true,
    },
    saasPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SaaSPlan',
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial
    },
    saasExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      index: true,
    },
  },
  { timestamps: true }
);

// 1. Owner Login Lookup: loads the owner's gym immediately upon authentication. Without it: Scans all gyms in database on every owner login.
gymSchema.index({ ownerId: 1 });

// 2. Gym lookup by phone number (e.g. support, SaaS verification, OTP). Without it: Full collection scan when resolving gym by phone.
gymSchema.index({ phone: 1 });

export const Gym = mongoose.model('Gym', gymSchema);
export default Gym;
