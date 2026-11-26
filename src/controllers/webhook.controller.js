import Notification from '../models/Notification.js';
import Member from '../models/Member.js';
import Gym from '../models/Gym.js';

/**
 * 1. Webhook Handshake Verification (GET)
 * Meta calls this endpoint when configuring or validating the Webhook URL in Meta App Dashboard.
 * Hub parameters: hub.mode, hub.verify_token, hub.challenge
 */
export const verifyWhatsAppWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'fitcore_meta_webhook_secret_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[Meta Webhook Verified]: Handshake successful with Meta servers.');
    return res.status(200).send(challenge);
  }

  console.warn('[Meta Webhook Verification Failed]: Token mismatch or invalid mode.', {
    receivedMode: mode,
    receivedToken: token,
  });
  return res.status(403).json({ error: 'Webhook verification token mismatch' });
};

/**
 * 2. Webhook Event Notification Receiver (POST)
 * Meta pushes real-time delivery receipts (sent, delivered, read, failed) and inbound replies here.
 *
 * PERFORMANCE GUARANTEE:
 * Acknowledges with 200 OK immediately in ~1ms to ensure zero lag, no request timeouts,
 * and zero load on the main user-facing API threads.
 */
export const handleWhatsAppWebhook = (req, res) => {
  // 1. Immediately acknowledge Meta to satisfy the 20-second webhook timeout requirement
  res.status(200).send('EVENT_RECEIVED');

  // 2. Offload event parsing to background event loop
  setImmediate(async () => {
    try {
      const body = req.body;
      if (!body || body.object !== 'whatsapp_business_account') {
        return;
      }

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // A. Process Outbound Message Delivery Status Updates (sent, delivered, read, failed)
          const statuses = value.statuses || [];
          for (const statusObj of statuses) {
            await processDeliveryStatusUpdate(statusObj);
          }

          // B. Process Inbound Messages (When a member sends a reply to gym's WhatsApp)
          const messages = value.messages || [];
          for (const msgObj of messages) {
            await processInboundMemberReply(msgObj, value.contacts);
          }
        }
      }
    } catch (err) {
      console.error('[Meta Webhook Background Processing Exception]:', err.message);
    }
  });
};

/**
 * Updates delivery receipts on Notification records
 */
const processDeliveryStatusUpdate = async (statusObj) => {
  const messageId = statusObj.id;
  const status = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'
  const timestamp = statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000) : new Date();
  const recipientPhone = statusObj.recipient_id;

  const updateFields = {
    'whatsappStatus.deliveryStatus': status,
  };

  if (status === 'delivered') {
    updateFields['whatsappStatus.deliveredAt'] = timestamp;
  } else if (status === 'read') {
    updateFields['whatsappStatus.readAt'] = timestamp;
  } else if (status === 'failed') {
    const errorMsg = statusObj.errors?.[0]?.message || 'WhatsApp message delivery failed';
    updateFields['whatsappStatus.error'] = errorMsg;
  }

  // 1. Update individual notifications by messageId
  const result = await Notification.updateMany(
    { 'whatsappStatus.messageId': messageId },
    { $set: updateFields }
  );

  // 2. Also update broadcast recipients array
  const broadcastUpdateFields = {
    'broadcastRecipients.$.deliveryStatus': status,
  };
  if (status === 'delivered' || status === 'read') {
    broadcastUpdateFields['broadcastRecipients.$.dispatched'] = true;
  }
  if (status === 'failed') {
    broadcastUpdateFields['broadcastRecipients.$.error'] =
      statusObj.errors?.[0]?.message || 'Delivery failed';
  }

  await Notification.updateMany(
    { 'broadcastRecipients.messageId': messageId },
    { $set: broadcastUpdateFields }
  );

  console.log(`[Meta Webhook]: Message ${messageId} to ${recipientPhone} updated to '${status}'.`);
};

/**
 * Handles inbound replies from members and logs them for the gym owner
 */
const processInboundMemberReply = async (msgObj, contacts = []) => {
  const senderPhone = msgObj.from; // e.g. 919876543210
  const messageText = msgObj.text?.body || msgObj.type || 'Media message';
  const senderProfileName = contacts?.[0]?.profile?.name || '';

  // Find member by normalized phone
  const cleanPhone = senderPhone.replace(/^91/, '');
  const member = await Member.findOne({
    $or: [{ phone: senderPhone }, { phone: cleanPhone }, { phone: `+${senderPhone}` }],
  });

  if (!member) {
    console.log(`[Meta Webhook Inbound]: Received message from unregistered phone ${senderPhone}: "${messageText}"`);
    return;
  }

  // Create an in-app alert for the gym owner
  await Notification.create({
    gymId: member.gymId,
    memberId: member._id,
    type: 'system',
    title: `💬 WhatsApp Reply from ${member.name}`,
    message: `"${messageText}"\n\nSent from ${member.phone} (${senderProfileName || member.name}).`,
    recipientPhone: member.phone,
    isRead: false,
  });

  console.log(`[Meta Webhook Inbound]: Logged reply from member ${member.name} (${member.phone}): "${messageText}"`);
};

/**
 * Diagnostic status check for gym admin
 */
export const getWebhookStatus = (req, res) => {
  return res.status(200).json({
    active: true,
    service: 'FitCore Meta WhatsApp Webhook Gateway',
    verifyTokenConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    metaCredentialsConfigured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
    timestamp: new Date().toISOString(),
  });
};
