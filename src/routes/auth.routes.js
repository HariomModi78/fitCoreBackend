import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {
  register,
  login,
  getCurrentUser,
  sendWhatsAppOtpHandler,
  verifyWhatsAppOtpHandler,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { verifyJWT } from '../middlewares/auth.js';

const router = Router();

// Optional auth helper so logged-in users get their profile automatically attached
const optionalJWT = async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (token) {
    try {
      const decodedToken = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fitcore_super_secret_jwt_access_key_2025'
      );
      const user = await User.findById(decodedToken.id).select('-password');
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (e) {
      // Ignore invalid or expired token on optional route
    }
  }
  next();
};

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyJWT, getCurrentUser);

// WhatsApp OTP routes
router.post('/send-whatsapp-otp', optionalJWT, sendWhatsAppOtpHandler);
router.post('/verify-whatsapp-otp', optionalJWT, verifyWhatsAppOtpHandler);

// Password Reset via WhatsApp OTP
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
