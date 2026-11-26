import { Router } from 'express';
import {
  getPlatformStats,
  getAllGyms,
  updateGymStatus,
  getPlatformUsers,
  getPlatformAuditLogs,
} from '../controllers/superadmin.controller.js';
import {
  getSaaSPlans,
  createSaaSPlan,
  updateSaaSPlan,
  deleteSaaSPlan,
} from '../controllers/saas.controller.js';
import { verifyJWT, verifySuperAdmin } from '../middlewares/auth.js';

const router = Router();

// Strict security enforcement: All superadmin routes require valid JWT + isSuperAdmin: true
router.use(verifyJWT, verifySuperAdmin);

// Platform Overview & KPIs
router.get('/stats', getPlatformStats);

// Gym Tenants Management
router.get('/gyms', getAllGyms);
router.patch('/gyms/:id/status', updateGymStatus);

// SaaS Pricing Plans Management
router.get('/plans', getSaaSPlans);
router.post('/plans', createSaaSPlan);
router.patch('/plans/:id', updateSaaSPlan);
router.delete('/plans/:id', deleteSaaSPlan);

// Users & Audit Logs
router.get('/users', getPlatformUsers);
router.get('/audit-logs', getPlatformAuditLogs);

export default router;
