import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import {
  getCurrentSubscription,
  getPlans,
  changePlan,
  renewSubscription,
  cancelSubscription,
  reactivateSubscription,
  getHistory
} from '../controllers/subscriptionController.js';

const router = Router();

// All subscription management routes require authenticated gym owner/admin
router.use(verifyAuth, requireRole('OWNER', 'ADMIN'));

router.get('/', getCurrentSubscription);
router.get('/status', getCurrentSubscription);
router.get('/plans', getPlans);
router.post('/change-plan', changePlan);
router.post('/renew', renewSubscription);
router.post('/checkout', renewSubscription);
router.post('/cancel', cancelSubscription);
router.post('/reactivate', reactivateSubscription);
router.get('/history', getHistory);

export default router;
