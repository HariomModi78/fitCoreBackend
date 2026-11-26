import { Router } from 'express';
import {
  getGymProfile,
  updateGymProfile,
  completeOnboarding,
} from '../controllers/gym.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireRole } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/profile').get(getGymProfile).patch(requireRole('owner'), updateGymProfile);
router.post('/onboarding', requireRole('owner'), completeOnboarding);

export default router;
