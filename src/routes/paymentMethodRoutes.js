import { Router } from 'express';
import {
  getPaymentMethods,
  getPaymentMethodById,
  createPaymentMethod,
  updatePaymentMethod,
  updatePaymentMethodStatus,
  deletePaymentMethod
} from '../controllers/paymentMethodController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all payment method routes
router.use(verifyAuth);

// GET /api/payment-methods - List payment methods
router.get('/', getPaymentMethods);

// GET /api/payment-methods/:id - Get single payment method
router.get('/:id', getPaymentMethodById);

// POST /api/payment-methods - Create safe tokenized payment method
router.post('/', requireRole('OWNER', 'ADMIN'), createPaymentMethod);

// PUT /api/payment-methods/:id - Update safe payment method fields
router.put('/:id', requireRole('OWNER', 'ADMIN'), updatePaymentMethod);

// PATCH /api/payment-methods/:id/status - Update status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updatePaymentMethodStatus);

// DELETE /api/payment-methods/:id - Safe deletion (restricted if payments exist)
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deletePaymentMethod);

export default router;
