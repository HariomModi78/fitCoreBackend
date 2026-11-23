import { Router } from 'express';
import {
  getSaaSPlans,
  createSaaSPlan,
  updateSaaSPlan,
  deleteSaaSPlan,
  createSubscriptionOrder,
  verifyAndActivateSubscription,
  getGymSaaSStatus,
} from '../controllers/saas.controller.js';
import { verifyJWT, verifySuperAdmin } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';

const router = Router();

// 1. Plan Catalog (Accessible to all authenticated users)
router.get('/plans', verifyJWT, getSaaSPlans);

// 2. Superadmin Management Endpoints (Only Superadmin can add/edit plans)
router.post('/plans', verifyJWT, verifySuperAdmin, createSaaSPlan);
router.patch('/plans/:id', verifyJWT, verifySuperAdmin, updateSaaSPlan);
router.delete('/plans/:id', verifyJWT, verifySuperAdmin, deleteSaaSPlan);

// 3. Gym SaaS Status & Checkout
router.get('/status', verifyJWT, requireTenant, getGymSaaSStatus);
router.post('/create-order', verifyJWT, requireTenant, createSubscriptionOrder);
router.post('/verify-payment', verifyJWT, requireTenant, verifyAndActivateSubscription);

export default router;
