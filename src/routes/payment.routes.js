import { Router } from 'express';
import {
  getPayments,
  recordPayment,
  getReceipt,
} from '../controllers/payment.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getPayments).post(requireActiveSaaS, recordPayment);
router.route('/:id/receipt').get(getReceipt);

export default router;
