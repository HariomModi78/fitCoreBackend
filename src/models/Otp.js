import mongoose from 'mongoose';
import crypto from 'crypto';

const otpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    // Cryptographically hashed OTP (SHA-256) so plaintext is never stored in DB
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['phone_verification', 'forgot_password', 'login'],
      default: 'phone_verification',
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL Index: MongoDB background thread automatically purges expired OTPs at exact expiry timestamp. Without it: Dead OTP records accumulate forever in DB wasting storage.
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

/**
 * Hash a plain 6-digit OTP using SHA-256
 */
otpSchema.statics.hashOtp = function (rawOtp) {
  if (!rawOtp) return '';
  return crypto.createHash('sha256').update(String(rawOtp).trim()).digest('hex');
};

/**
 * Safely verify a candidate OTP against the stored hash
 */
otpSchema.methods.verifyOtp = function (candidateOtp) {
  if (!candidateOtp) return false;
  const candidateHash = crypto
    .createHash('sha256')
    .update(String(candidateOtp).trim())
    .digest('hex');
  return this.otp === candidateHash;
};

export const Otp = mongoose.model('Otp', otpSchema);
export default Otp;
