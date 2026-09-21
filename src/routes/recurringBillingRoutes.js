import { Router } from 'express';
import {
  getRecurringBillings,
  getRecurringBillingById,
  createRecurringBilling,
  updateRecurringBilling,
  updateStatus,
  pauseRecurringBilling,
  resumeRecurringBilling,
  deleteRecurringBilling,
  processDueRecurringBilling
} from '../controllers/recurringBillingController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all recurring billing routes
router.use(verifyAuth);

// GET /api/recurring-billing - List recurring billing schedules
router.get('/', getRecurringBillings);

// POST /api/recurring-billing/process-due - Process due billing cycles (must be before /:id)
router.post('/process-due', requireRole('OWNER', 'ADMIN'), processDueRecurringBilling);

// GET /api/recurring-billing/:id - Get recurring billing details
router.get('/:id', getRecurringBillingById);

// POST /api/recurring-billing - Create recurring billing schedule
router.post('/', requireRole('OWNER', 'ADMIN'), createRecurringBilling);

// PUT /api/recurring-billing/:id - Update recurring billing schedule
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateRecurringBilling);

// PATCH /api/recurring-billing/:id/status - Update status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updateStatus);

// PATCH /api/recurring-billing/:id/pause - Pause recurring billing
router.patch('/:id/pause', requireRole('OWNER', 'ADMIN'), pauseRecurringBilling);

// PATCH /api/recurring-billing/:id/resume - Resume recurring billing
router.patch('/:id/resume', requireRole('OWNER', 'ADMIN'), resumeRecurringBilling);

// DELETE /api/recurring-billing/:id - Safe deletion / cancellation
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteRecurringBilling);

export default router;
