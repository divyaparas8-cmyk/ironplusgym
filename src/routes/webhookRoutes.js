import { Router } from 'express';
import { handlePaymentWebhook } from '../controllers/webhookController.js';

const router = Router();

// POST /api/webhooks/payment & /api/webhooks/stripe - External payment provider webhook endpoints
router.post('/payment', handlePaymentWebhook);
router.post('/stripe', handlePaymentWebhook);

export default router;
