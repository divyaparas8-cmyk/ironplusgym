import { Router } from 'express';
import {
  getPayments,
  getPaymentById,
  createPayment,
  manualSettle,
  refundPayment
} from '../controllers/paymentController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all payment routes
router.use(verifyAuth);

// GET /api/payments - List payments
router.get('/', getPayments);

// GET /api/payments/:id - Get payment details
router.get('/:id', getPaymentById);

// POST /api/payments - Create payment ledger record
router.post('/', requireRole('OWNER', 'ADMIN'), createPayment);

// POST /api/payments/manual-settle - Manually settle payment
router.post('/manual-settle', requireRole('OWNER', 'ADMIN'), manualSettle);

// POST /api/payments/:id/refund - Process refund
router.post('/:id/refund', requireRole('OWNER', 'ADMIN'), refundPayment);

export default router;
