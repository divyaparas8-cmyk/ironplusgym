import { Router } from 'express';
import {
  getPayments,
  getPaymentById,
  createPayment,
  manualSettle,
  refundPayment,
  getPaymentConfig,
  createPaymentIntent,
  recordMemberPayment
} from '../controllers/paymentController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all payment routes
router.use(verifyAuth);

// GET /api/payments/config - Get gateway publishable configuration
router.get('/config', getPaymentConfig);

// POST /api/payments/create-intent - Create payment intent for client-side card payment
router.post('/create-intent', requireRole('OWNER', 'ADMIN'), createPaymentIntent);

// POST /api/payments/record & /api/payments/record-member-payment - Direct Member Cash or QR Payment
router.post('/record', requireRole('OWNER', 'ADMIN'), recordMemberPayment);
router.post('/record-member-payment', requireRole('OWNER', 'ADMIN'), recordMemberPayment);

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
