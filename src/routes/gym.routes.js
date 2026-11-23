import { Router } from 'express';
import {
  getGymProfile,
  updateGymProfile,
  completeOnboarding,
} from '../controllers/gym.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/profile').get(getGymProfile).patch(updateGymProfile);
router.post('/onboarding', completeOnboarding);

export default router;
