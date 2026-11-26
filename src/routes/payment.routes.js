import { Router } from 'express';
import {
  getPayments,
  recordPayment,
  getReceipt,
} from '../controllers/payment.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router
  .route('/')
  .get(requirePermission('view_payments', 'record_payments'), getPayments)
  .post(requireActiveSaaS, requirePermission('record_payments'), recordPayment);

router.route('/:id/receipt').get(requirePermission('view_payments', 'record_payments'), getReceipt);

export default router;
