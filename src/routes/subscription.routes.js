import { Router } from 'express';
import {
  createSubscription,
  renewSubscription,
  getSubscriptions,
} from '../controllers/subscription.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getSubscriptions).post(requireActiveSaaS, createSubscription);
router.route('/:id/renew').post(requireActiveSaaS, renewSubscription);

export default router;
