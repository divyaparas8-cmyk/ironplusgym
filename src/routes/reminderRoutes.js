import express from 'express';
import {
  getReminders,
  getReminderById,
  createReminder,
  updateReminderStatus,
  deleteReminder,
  processBatchReminders
} from '../controllers/reminderController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = express.Router();

// Enforce authentication across all reminder routes
router.use(verifyAuth);

router.get('/', getReminders);
router.post('/process', requireRole('OWNER', 'ADMIN'), processBatchReminders);
router.get('/:id', getReminderById);
router.post('/', createReminder);
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updateReminderStatus);
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteReminder);

export default router;
