import prisma from '../prisma.js';

class WebhookService {
  /**
   * Check if a webhook event ID has already been recorded in AuditLog (Idempotency)
   */
  async checkIdempotency(eventId) {
    if (!eventId) return { isDuplicate: false };

    const existingLog = await prisma.auditLog.findFirst({
      where: {
        entity: 'WebhookEvent',
        entityId: eventId
      }
    });

    return {
      isDuplicate: Boolean(existingLog),
      existingLog
    };
  }

  /**
   * Normalize provider-specific webhook events into unified internal representations
   */
  normalizeEvent(rawEvent) {
    const eventId = rawEvent.id;
    const rawType = String(rawEvent.type || '').toLowerCase();
    const dataObject = rawEvent.data?.object || rawEvent.data || {};
    const provider = rawEvent.provider || 'STRIPE';

    let normalizedType = 'UNKNOWN';

    // Map provider event types
    if (
      rawType === 'payment_intent.succeeded' ||
      rawType === 'payment.succeeded' ||
      rawType === 'charge.succeeded'
    ) {
      normalizedType = 'PAYMENT_SUCCEEDED';
    } else if (
      rawType === 'payment_intent.payment_failed' ||
      rawType === 'payment.failed' ||
      rawType === 'charge.failed'
    ) {
      normalizedType = 'PAYMENT_FAILED';
    } else if (
      rawType === 'payment_intent.processing' ||
      rawType === 'payment.pending'
    ) {
      normalizedType = 'PAYMENT_PENDING';
    } else if (
      rawType === 'charge.refunded' ||
      rawType === 'payment.refunded'
    ) {
      normalizedType = 'PAYMENT_REFUNDED';
    } else if (
      rawType === 'invoice.paid' ||
      rawType === 'invoice.payment_succeeded'
    ) {
      normalizedType = 'INVOICE_PAID';
    } else if (
      rawType === 'invoice.payment_failed'
    ) {
      normalizedType = 'INVOICE_PAYMENT_FAILED';
    } else if (
      rawType === 'customer.subscription.deleted' ||
      rawType === 'subscription.cancelled'
    ) {
      normalizedType = 'SUBSCRIPTION_CANCELLED';
    }

    // Extract resource references
    const providerPaymentId =
      dataObject.id?.startsWith('ch_') || dataObject.id?.startsWith('pi_')
        ? dataObject.id
        : dataObject.payment_intent || dataObject.providerPaymentId || null;

    const internalPaymentId =
      dataObject.metadata?.paymentId || dataObject.paymentId || null;

    const providerSubscriptionId =
      dataObject.subscription ||
      (dataObject.id?.startsWith('sub_') ? dataObject.id : dataObject.providerSubscriptionId) ||
      null;

    const invoiceNumber =
      dataObject.invoiceNumber ||
      dataObject.number ||
      dataObject.metadata?.invoiceNumber ||
      null;

    const invoiceId =
      dataObject.invoice ||
      dataObject.metadata?.invoiceId ||
      dataObject.invoiceId ||
      null;

    const amount =
      typeof dataObject.amount === 'number'
        ? (rawType.startsWith('payment_intent') || rawType.startsWith('charge')
            ? dataObject.amount / 100
            : dataObject.amount)
        : Number(dataObject.amount || 0);

    const currency = (dataObject.currency || 'USD').toUpperCase();

    const failureReason =
      dataObject.last_payment_error?.message ||
      dataObject.failureReason ||
      dataObject.failure_message ||
      'Provider payment failed';

    const refundReason =
      dataObject.refunds?.data?.[0]?.reason ||
      dataObject.refundReason ||
      'Customer refund processed';

    return {
      id: eventId,
      rawType,
      type: normalizedType,
      provider,
      providerPaymentId,
      internalPaymentId,
      providerSubscriptionId,
      invoiceNumber,
      invoiceId,
      amount,
      currency,
      failureReason,
      refundReason,
      timestamp: rawEvent.created ? new Date(rawEvent.created * 1000) : new Date()
    };
  }
}

export default new WebhookService();
