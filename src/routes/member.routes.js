import { Router } from 'express';
import {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  archiveMember,
} from '../controllers/member.controller.js';
import { verifyJWT } from '../middlewares/auth.js';
import { requireTenant } from '../middlewares/tenant.js';
import { requireActiveSaaS } from '../middlewares/saasGuard.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = Router();
router.use(verifyJWT, requireTenant);

router
  .route('/')
  .get(requirePermission('view_members', 'manage_members'), getMembers)
  .post(requireActiveSaaS, requirePermission('manage_members'), createMember);

router
  .route('/:id')
  .get(requirePermission('view_members', 'manage_members'), getMemberById)
  .patch(requireActiveSaaS, requirePermission('manage_members'), updateMember)
  .delete(requireActiveSaaS, requirePermission('manage_members'), archiveMember);

export default router;
