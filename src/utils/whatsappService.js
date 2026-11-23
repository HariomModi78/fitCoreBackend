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

export const dispatchWhatsAppMessage = async ({ phone, text, gymSettings }) => {
  // Check if external webhook / API key is provided
  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  const waUrl = generateWhatsAppUrl(phone, text);

  // In production, if WHATSAPP_API_URL or gateway is configured, call it
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

  // Standalone mode: Instant direct WhatsApp Web/Mobile link
  console.log(`[WhatsApp Alert Generated for ${formattedPhone}]: ${text}`);
  return { success: true, via: 'direct_link', waUrl };
};

export default {
  formatPhoneNumberForWhatsApp,
  generateWhatsAppExpiryMessage,
  generateWhatsAppUrl,
  dispatchWhatsAppMessage,
};
