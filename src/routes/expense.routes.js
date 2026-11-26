import { Router } from 'express';
import {
  getExpenses,
  createExpense,
  deleteExpense,
} from '../controllers/expense.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router
  .route('/')
  .get(requirePermission('manage_expenses', 'view_reports'), getExpenses)
  .post(requireActiveSaaS, requirePermission('manage_expenses'), createExpense);

router.route('/:id').delete(requireActiveSaaS, requirePermission('manage_expenses'), deleteExpense);

export default router;
