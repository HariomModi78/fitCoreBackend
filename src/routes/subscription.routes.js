import { Router } from 'express';
import {
  createSubscription,
  renewSubscription,
  getSubscriptions,
} from '../controllers/subscription.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router
  .route('/')
  .get(requirePermission('view_members', 'manage_memberships'), getSubscriptions)
  .post(requireActiveSaaS, requirePermission('manage_memberships'), createSubscription);

router.route('/:id/renew').post(requireActiveSaaS, requirePermission('manage_memberships'), renewSubscription);

export default router;
