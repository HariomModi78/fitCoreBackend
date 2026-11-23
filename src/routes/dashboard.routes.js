import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboard.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/summary', getDashboardSummary);

export default router;
