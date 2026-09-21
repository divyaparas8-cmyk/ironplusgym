import { Router } from 'express';
import { handlePaymentWebhook } from '../controllers/webhookController.js';

const router = Router();

// POST /api/webhooks/payment - External payment provider webhook endpoint (NO JWT, signature-verified)
router.post('/payment', handlePaymentWebhook);

export default router;
