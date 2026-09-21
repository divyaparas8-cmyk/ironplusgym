import { Router } from 'express';
import {
  getBillingSettings,
  updateBillingSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getPaymentProvider
} from '../controllers/settingsController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/billing', getBillingSettings);
router.put('/billing', updateBillingSettings);

router.get('/notifications', getNotificationSettings);
router.put('/notifications', updateNotificationSettings);

router.get('/provider', getPaymentProvider);

export default router;
