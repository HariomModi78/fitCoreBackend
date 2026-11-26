import { Router } from 'express';
import { getFinancialReport } from '../controllers/report.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/financial', requirePermission('view_reports'), getFinancialReport);

export default router;
