import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  triggerExpiryCheck,
  sendWhatsAppNotification,
  getMemberRenewalWhatsAppLink,
} from '../controllers/notification.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/', getNotifications);
router.post('/trigger-reminders', requireActiveSaaS, triggerExpiryCheck);
router.patch('/:id/read', markAsRead);
router.post('/:id/send-whatsapp', requireActiveSaaS, sendWhatsAppNotification);
router.get('/member/:memberId/whatsapp', requireActiveSaaS, getMemberRenewalWhatsAppLink);

export default router;
