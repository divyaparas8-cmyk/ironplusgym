import express from 'express';
import {
  getDunningOverview,
  evaluatePaymentDunning,
  processAllFailedPayments,
  batchUpcomingReminders,
  batchOverdueReminders,
  batchExpiryReminders
} from '../controllers/dunningController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = express.Router();

// Enforce authentication across all dunning routes
router.use(verifyAuth);

router.get('/overview', getDunningOverview);
router.post('/process', requireRole('OWNER', 'ADMIN'), processAllFailedPayments);
router.post('/evaluate/:paymentId', requireRole('OWNER', 'ADMIN'), evaluatePaymentDunning);
router.post('/retry/:paymentId', requireRole('OWNER', 'ADMIN'), evaluatePaymentDunning);
router.post('/batch/upcoming', requireRole('OWNER', 'ADMIN'), batchUpcomingReminders);
router.post('/batch/overdue', requireRole('OWNER', 'ADMIN'), batchOverdueReminders);
router.post('/batch/expiry', requireRole('OWNER', 'ADMIN'), batchExpiryReminders);

export default router;

