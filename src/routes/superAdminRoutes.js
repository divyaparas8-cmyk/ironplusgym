import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/authorize.js';
import {
  getDashboard,
  getGyms,
  getGymById,
  updateGymSubscription,
  getSubscriptions,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getPlatformPayments,
  getPlatformCommissions,
  getPlatformPayouts,
  getPlatformSettings,
  updatePlatformSettings
} from '../controllers/superAdminController.js';

const router = Router();

// Protect ALL Super Admin endpoints with JWT validation & Super Admin Role
router.use(verifyAuth, requireSuperAdmin);

// Dashboard
router.get('/dashboard', getDashboard);

// Platform Settings & Admin Security
router.get('/settings', getPlatformSettings);
router.put('/settings', updatePlatformSettings);

// Gym Tenants Management
router.get('/gyms', getGyms);
router.get('/gyms/:id', getGymById);
router.patch('/gyms/:id/subscription', updateGymSubscription);

// Subscriptions & SaaS Plans
router.get('/subscriptions', getSubscriptions);
router.get('/subscription-plans', getSubscriptionPlans);
router.post('/subscription-plans', createSubscriptionPlan);
router.put('/subscription-plans/:id', updateSubscriptionPlan);
router.delete('/subscription-plans/:id', deleteSubscriptionPlan);

// Platform-wide Financials & Ledgers
router.get('/payments', getPlatformPayments);
router.get('/commissions', getPlatformCommissions);
router.get('/payouts', getPlatformPayouts);

export default router;

