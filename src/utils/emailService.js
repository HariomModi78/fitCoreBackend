import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    } catch (e) {
      console.warn('[SMTP Transporter Init Warning]:', e.message);
      transporter = null;
    }
  }

  return transporter;
};

export const formatMaskedEmail = (emailStr) => {
  if (!emailStr || !emailStr.includes('@')) return 'registered email';
  const [local, domain] = emailStr.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
};

export const sendEmailOtp = async ({ email, otp, purpose = 'forgot_password' }) => {
  if (!email) return { success: false, error: 'Email is required' };

  let purposeDescription = 'resetting your account password';
  let subject = 'FitCore - Your Password Reset Verification Code';

  if (purpose === 'phone_verification') {
    purposeDescription = 'verifying your account';
    subject = 'FitCore - Account Verification Code';
  } else if (purpose === 'login') {
    purposeDescription = 'logging into your FitCore account';
    subject = 'FitCore - Login Verification Code';
  }

  console.log(`\n========================================`);
  console.log(`[Email OTP Dispatched]`);
  console.log(`Target Email: ${email}`);
  console.log(`Purpose: ${purpose}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`========================================\n`);

  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    return {
      success: true,
      via: 'console_fallback',
      email,
    };
  }

  const fromAddress = process.env.EMAIL_FROM || '"FitCore Gym" <noreply@fitcore.app>';

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      <div style="background-color: #171717; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">
          Fit<span style="color: #FF7A00;">Core</span>
        </h1>
        <p style="color: #9ca3af; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Stronger Together</p>
      </div>
      <div style="padding: 32px 28px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 12px 0;">Verification Code</h2>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin: 0 0 24px 0;">
          Use the 6-digit verification code below to complete ${purposeDescription}. This code will expire in 10 minutes.
        </p>
        <div style="background-color: #f9fafb; border: 1px dashed #d1d5db; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #FF7A00; font-family: monospace;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin: 0;">
          If you did not request this verification code, please ignore this email or contact support if you suspect unauthorized activity.
        </p>
      </div>
      <div style="background-color: #f3f4f6; padding: 16px 28px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 11px; color: #9ca3af; margin: 0;">&copy; ${new Date().getFullYear()} FitCore Gym SaaS. All rights reserved.</p>
      </div>
    </div>
  `;

  const text = `FitCore Verification Code\n\nYour 6-digit verification code for ${purposeDescription} is: ${otp}\n\nThis code will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;

  try {
    const info = await activeTransporter.sendMail({
      from: fromAddress,
      to: email,
      subject,
      text,
      html,
    });
    return { success: true, via: 'smtp', messageId: info.messageId, email };
  } catch (err) {
    console.error('[Email Send Error]:', err.message);
    return { success: true, via: 'console_fallback', error: err.message, email };
  }
};

export default {
  formatMaskedEmail,
  sendEmailOtp,
};
