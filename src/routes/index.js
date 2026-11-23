import { Router } from 'express';
import authRoutes from './auth.routes.js';
import memberRoutes from './member.routes.js';
import planRoutes from './plan.routes.js';
import subscriptionRoutes from './subscription.routes.js';
import paymentRoutes from './payment.routes.js';
import expenseRoutes from './expense.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import reportRoutes from './report.routes.js';
import staffRoutes from './staff.routes.js';
import notificationRoutes from './notification.routes.js';
import gymRoutes from './gym.routes.js';
import saasRoutes from './saas.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/members', memberRoutes);
router.use('/membership-plans', planRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/payments', paymentRoutes);
router.use('/expenses', expenseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/staff', staffRoutes);
router.use('/notifications', notificationRoutes);
router.use('/gyms', gymRoutes);
router.use('/saas', saasRoutes);

export default router;
