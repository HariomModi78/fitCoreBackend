import { Router } from 'express';
import {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from '../controllers/plan.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getPlans).post(requireActiveSaaS, createPlan);
router.route('/:id').patch(requireActiveSaaS, updatePlan).delete(requireActiveSaaS, deletePlan);

export default router;
