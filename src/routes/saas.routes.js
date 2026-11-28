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
import { verifyJWT, verifySuperAdmin, optionalAuth } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireRole } from '../middlewares/rbac.js';

const router = Router();

// 1. Plan Catalog (Accessible publicly and to all authenticated users)
router.get('/plans', optionalAuth, getSaaSPlans);

// 2. Superadmin Management Endpoints (Only Superadmin can add/edit plans)
router.post('/plans', verifyJWT, verifySuperAdmin, createSaaSPlan);
router.patch('/plans/:id', verifyJWT, verifySuperAdmin, updateSaaSPlan);
router.delete('/plans/:id', verifyJWT, verifySuperAdmin, deleteSaaSPlan);

// 3. Gym SaaS Status & Checkout (Only Gym Owner can initiate purchases)
router.get('/status', verifyJWT, requireTenant, getGymSaaSStatus);
router.post('/create-order', verifyJWT, requireTenant, requireRole('owner'), createSubscriptionOrder);
router.post('/verify-payment', verifyJWT, requireTenant, requireRole('owner'), verifyAndActivateSubscription);

export default router;
