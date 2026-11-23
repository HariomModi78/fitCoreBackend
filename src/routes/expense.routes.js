import { Router } from 'express';
import {
  getExpenses,
  createExpense,
  deleteExpense,
} from '../controllers/expense.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getExpenses).post(requireActiveSaaS, createExpense);
router.route('/:id').delete(requireActiveSaaS, deleteExpense);

export default router;
