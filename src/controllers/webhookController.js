import { verifyWebhookSignature } from '../utils/webhookSignature.js';
import { validateWebhookEvent } from '../validators/webhookValidator.js';
import WebhookService from '../services/webhookService.js';
import PaymentWebhookService from '../services/paymentWebhookService.js';

/**
 * Handle POST /api/webhooks/payment
 * No JWT middleware — Security enforced via cryptographic signature verification
 */
export const handlePaymentWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signatureHeader = req.headers['stripe-signature'] || req.headers['x-webhook-signature'];

    // 1. Signature Verification
    if (!signatureHeader) {
      return res.status(401).json({
        success: false,
        message: 'Missing webhook signature header'
      });
    }

    const secret = process.env.WEBHOOK_SECRET;
    const { isValid, error: sigError } = verifyWebhookSignature({
      rawBody,
      signatureHeader,
      secret
    });

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: `Webhook signature verification failed: ${sigError || 'Invalid signature'}`
      });
    }

    // 2. Parse payload safely
    let parsedBody;
    try {
      parsedBody = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Malformed JSON payload'
      });
    }

    // 3. Event Validation
    const { isValid: isEventValid, errors } = validateWebhookEvent(parsedBody);
    if (!isEventValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    // 4. Normalize Event
    const normalizedEvent = WebhookService.normalizeEvent(parsedBody);

    // 5. Process Event & Synchronize Financial Ledger
    const result = await PaymentWebhookService.processEvent(normalizedEvent);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal webhook processing error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};
