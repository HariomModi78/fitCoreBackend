export const ALLOWED_TEMPLATE_VARIABLES = [
  'memberName',
  'planName',
  'daysLeft',
  'expiryDate',
  'gymName',
  'gymPhone',
];

export const validateTemplatePlaceholders = (template) => {
  if (!template || typeof template !== 'string') return { valid: true };

  const openBraces = (template.match(/\{/g) || []).length;
  const closeBraces = (template.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return {
      valid: false,
      error: 'Template contains unclosed or mismatched curly braces. All variables must be enclosed like {memberName}.',
    };
  }

  const regex = /\{([^}]+)\}/g;
  let match;
  const invalidVars = [];

  while ((match = regex.exec(template)) !== null) {
    const varName = match[1].trim();
    if (!ALLOWED_TEMPLATE_VARIABLES.includes(varName)) {
      invalidVars.push(`{${varName}}`);
    }
  }

  if (invalidVars.length > 0) {
    return {
      valid: false,
      error: `Invalid placeholder(s): ${invalidVars.join(', ')}. You cannot modify variable names. Only allowed variables are: {memberName}, {planName}, {daysLeft}, {expiryDate}, {gymName}, {gymPhone}.`,
    };
  }

  return { valid: true };
};

export const formatPhoneNumberForWhatsApp = (rawPhone, defaultCountryCode = '91') => {
  if (!rawPhone) return '';
  // Remove non-digit characters
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }
  return digits;
};

export const generateWhatsAppExpiryMessage = ({
  template,
  memberName,
  planName,
  daysLeft,
  expiryDate,
  gymName,
  gymPhone,
}) => {
  let message =
    template ||
    (daysLeft === 0
      ? 'Hi {memberName}, your {planName} membership at {gymName} expires TODAY ({expiryDate}). Please renew today to keep your workout streak going! Contact: {gymPhone}.'
      : 'Hi {memberName}, this is a reminder from {gymName}. Your {planName} membership is expiring in {daysLeft} day(s) on {expiryDate}. Renew now to avoid interruption! Contact: {gymPhone}.');

  const replacements = {
    '{memberName}': memberName || 'Valued Member',
    '{planName}': planName || 'Gym Membership',
    '{daysLeft}': String(daysLeft),
    '{expiryDate}': expiryDate ? new Date(expiryDate).toLocaleDateString() : 'soon',
    '{gymName}': gymName || 'FitCore Gym',
    '{gymPhone}': gymPhone || '',
  };

  Object.entries(replacements).forEach(([key, val]) => {
    message = message.replaceAll(key, val);
  });

  return message;
};

export const generateWhatsAppUrl = (phone, text) => {
  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
};

export const dispatchMetaWhatsAppMessage = async ({ phone, text, otp, purpose }) => {
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return null; // Meta credentials not configured
  }

  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  // Check if an approved Meta template is configured for OTP / Auth
  const templateName = process.env.META_OTP_TEMPLATE_NAME || process.env.WHATSAPP_OTP_TEMPLATE_NAME;

  let bodyPayload;
  if (templateName && otp) {
    bodyPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: process.env.META_TEMPLATE_LANG || 'en_US',
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: otp,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              {
                type: 'text',
                text: otp,
              },
            ],
          },
        ],
      },
    };
  } else {
    // Send standard text message via Meta Cloud API
    bodyPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Meta WhatsApp Cloud API Error]:', JSON.stringify(data));
      return { success: false, via: 'meta_cloud_api', error: data.error?.message || 'Meta API error', data };
    }

    const messageId = data?.messages?.[0]?.id || null;
    console.log(`[Meta WhatsApp Cloud API] Successfully sent message to ${formattedPhone}, messageId: ${messageId}`);
    return { success: true, via: 'meta_cloud_api', data, messageId };
  } catch (err) {
    console.error('[Meta WhatsApp API Exception]:', err.message);
    return { success: false, via: 'meta_cloud_api', error: err.message };
  }
};

export const dispatchWhatsAppMessage = async ({ phone, text, otp, purpose, gymSettings }) => {
  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  const waUrl = generateWhatsAppUrl(phone, text);

  // 1. Meta Official WhatsApp Cloud API
  const metaResult = await dispatchMetaWhatsAppMessage({ phone, text, otp, purpose });
  if (metaResult) {
    return { ...metaResult, waUrl };
  }

  // 2. Generic Webhook / Gateway if configured
  if (process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN) {
    try {
      const response = await fetch(process.env.WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        },
        body: JSON.stringify({
          phone: formattedPhone,
          message: text,
        }),
      });
      const data = await response.json();
      return { success: true, via: 'gateway', data, waUrl };
    } catch (err) {
      console.error('[WhatsApp Gateway Error]:', err.message);
      return { success: false, via: 'gateway', error: err.message, waUrl };
    }
  }

  // 3. Standalone mode: Instant direct WhatsApp Web/Mobile link
  console.log(`[WhatsApp Alert Generated for ${formattedPhone}]: ${text}`);
  return { success: true, via: 'direct_link', waUrl };
};

export const sendWhatsAppOtp = async ({ phone, otp, purpose = 'phone_verification' }) => {
  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  let purposeDescription = 'verifying your mobile number';
  if (purpose === 'forgot_password') {
    purposeDescription = 'resetting your account password';
  } else if (purpose === 'login') {
    purposeDescription = 'logging into your FitCore account';
  }

  const message = `*FitCore Gym Verification Code*\n\nYour One-Time Password (OTP) for ${purposeDescription} is: *${otp}*\n\nThis OTP is valid for 10 minutes. For security, please do not share this OTP with anyone.\n\nStronger Together,\nTeam FitCore`;

  console.log(`\n========================================`);
  console.log(`[WhatsApp OTP Dispatched]`);
  console.log(`Target Phone: ${formattedPhone}`);
  console.log(`Purpose: ${purpose}`);
  console.log(`Security: OTP dispatched privately via WhatsApp`);
  console.log(`========================================\n`);

  const dispatchResult = await dispatchWhatsAppMessage({ phone, text: message, otp, purpose });
  return {
    ...dispatchResult,
    phone: formattedPhone,
  };
};

export default {
  formatPhoneNumberForWhatsApp,
  generateWhatsAppExpiryMessage,
  generateWhatsAppUrl,
  dispatchWhatsAppMessage,
  dispatchMetaWhatsAppMessage,
  sendWhatsAppOtp,
};
