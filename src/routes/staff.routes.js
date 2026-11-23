import { Router } from 'express';
import {
  getStaff,
  inviteStaff,
  updateStaffPermissions,
} from '../controllers/staff.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getStaff).post(inviteStaff);
router.route('/:id').patch(updateStaffPermissions);

export default router;
