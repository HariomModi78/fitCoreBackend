import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middlewares/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyJWT, getCurrentUser);

export default router;
