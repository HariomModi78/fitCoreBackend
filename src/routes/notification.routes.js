import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  triggerExpiryCheck,
  sendWhatsAppNotification,
  getMemberRenewalWhatsAppLink,
  sendBroadcastAlert,
  getBroadcastAudienceCount,
  sendBroadcastMemberWhatsApp,
} from '../controllers/notification.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/', getNotifications);
router.post('/trigger-reminders', requireActiveSaaS, requirePermission('send_notifications'), triggerExpiryCheck);
router.get('/broadcast/preview', requirePermission('send_notifications'), getBroadcastAudienceCount);
router.post('/broadcast', requireActiveSaaS, requirePermission('send_notifications'), sendBroadcastAlert);
router.post('/broadcast/:id/send-member', requireActiveSaaS, requirePermission('send_notifications'), sendBroadcastMemberWhatsApp);
router.patch('/:id/read', markAsRead);
router.post('/:id/send-whatsapp', requireActiveSaaS, requirePermission('send_notifications'), sendWhatsAppNotification);
router.get('/member/:memberId/whatsapp', requireActiveSaaS, requirePermission('send_notifications'), getMemberRenewalWhatsAppLink);

export default router;
