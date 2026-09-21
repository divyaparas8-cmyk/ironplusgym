import { Router } from 'express';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  updateInvoiceStatus
} from '../controllers/invoiceController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all invoice routes
router.use(verifyAuth);

// GET /api/invoices - List invoices
router.get('/', getInvoices);

// GET /api/invoices/:id - Get single invoice details
router.get('/:id', getInvoiceById);

// POST /api/invoices - Create new invoice
router.post('/', requireRole('OWNER', 'ADMIN'), createInvoice);

// PUT /api/invoices/:id - Update invoice
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateInvoice);

// PATCH /api/invoices/:id/status - Update invoice status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updateInvoiceStatus);

// Note: Destructive invoice deletion is strictly prohibited (financial audit record).

export default router;
