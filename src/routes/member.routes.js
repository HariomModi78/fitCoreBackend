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

const router = Router();
router.use(verifyJWT, requireTenant);

router.route('/').get(getMembers).post(requireActiveSaaS, createMember);
router.route('/:id').get(getMemberById).patch(requireActiveSaaS, updateMember).delete(requireActiveSaaS, archiveMember);

export default router;
