import { Router } from 'express';
import {
  getStaff,
  inviteStaff,
  updateStaffPermissions,
  removeStaff,
} from '../controllers/staff.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireRole } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

// All staff can view staff directory; only owners can invite, modify, or remove staff
router.route('/').get(getStaff).post(requireRole('owner'), inviteStaff);
router
  .route('/:id')
  .patch(requireRole('owner'), updateStaffPermissions)
  .delete(requireRole('owner'), removeStaff);

export default router;
