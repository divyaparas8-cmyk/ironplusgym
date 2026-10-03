import prisma from '../prisma.js';

class PaymentWebhookService {
  /**
   * Process a normalized webhook event atomically
   */
  async processEvent(normalizedEvent) {
    // 1. Check idempotency outside transaction first
    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        entity: 'WebhookEvent',
        entityId: normalizedEvent.id
      }
    });

    if (existingAudit) {
      return {
        received: true,
        duplicate: true,
        message: 'Event has already been processed'
      };
    }

    // 2. Safe acknowledgement for unknown event types
    if (normalizedEvent.type === 'UNKNOWN') {
      return {
        received: true,
        duplicate: false,
        processed: false,
        message: `Unknown event type '${normalizedEvent.rawType}' acknowledged without ledger mutation`
      };
    }

    // 3. Resolve internal record & derive gymId (Tenant Isolation)
    let payment = null;
    let invoice = null;
    let recurringBilling = null;
    let targetGymId = null;

    // A. Locate Payment
    if (normalizedEvent.providerPaymentId || normalizedEvent.internalPaymentId) {
      const orConditions = [];
      if (normalizedEvent.providerPaymentId) {
        orConditions.push({ providerPaymentId: normalizedEvent.providerPaymentId });
      }
      if (normalizedEvent.internalPaymentId) {
        orConditions.push({ id: normalizedEvent.internalPaymentId });
      }

      payment = await prisma.payment.findFirst({
        where: {
          OR: orConditions
        },
        include: {
          invoice: true
        }
      });

      if (payment) {
        targetGymId = payment.gymId;
      }
    }

    // B. Locate Invoice if relevant and not already found
    if (!targetGymId && (normalizedEvent.invoiceNumber || normalizedEvent.invoiceId)) {
      const orConditions = [];
      if (normalizedEvent.invoiceNumber) {
        orConditions.push({ invoiceNumber: normalizedEvent.invoiceNumber });
      }
      if (normalizedEvent.invoiceId) {
        orConditions.push({ id: normalizedEvent.invoiceId });
      }

      invoice = await prisma.invoice.findFirst({
        where: {
          OR: orConditions
        }
      });

      if (invoice) {
        targetGymId = invoice.gymId;
      }
    }

    // C. Locate RecurringBilling if relevant and not already found
    if (!targetGymId && normalizedEvent.providerSubscriptionId) {
      recurringBilling = await prisma.recurringBilling.findFirst({
        where: {
          providerSubscriptionId: normalizedEvent.providerSubscriptionId
        }
      });

      if (recurringBilling) {
        targetGymId = recurringBilling.gymId;
      }
    }

    // D. Locate GymSubscription if relevant
    let gymSubscription = null;
    if (!targetGymId && normalizedEvent.providerSubscriptionId) {
      gymSubscription = await prisma.gymSubscription.findFirst({
        where: {
          stripeSubscriptionId: normalizedEvent.providerSubscriptionId
        },
        include: { plan: true }
      });

      if (gymSubscription) {
        targetGymId = gymSubscription.gymId;
      }
    }

    // E. Locate Gym by Stripe Connected Account ID (for Connect webhooks)
    if (!targetGymId && normalizedEvent.stripeAccountId) {
      const providerRecord = await prisma.paymentProvider.findFirst({
        where: { stripeAccountId: normalizedEvent.stripeAccountId }
      });
      if (providerRecord) {
        targetGymId = providerRecord.gymId;
      }
    }

    // If no matching internal financial record was found, do NOT create fake records
    if (!targetGymId) {
      return {
        received: true,
        duplicate: false,
        processed: false,
        message: 'No matching internal record found for provider reference'
      };
    }

    // 4. Atomic Prisma Transaction for Coupled Financial Updates + AuditLog
    return await prisma.$transaction(async (tx) => {
      // Re-verify idempotency inside transaction for concurrency safety
      const inTxAudit = await tx.auditLog.findFirst({
        where: {
          entity: 'WebhookEvent',
          entityId: normalizedEvent.id
        }
      });

      if (inTxAudit) {
        return {
          received: true,
          duplicate: true,
          message: 'Event has already been processed'
        };
      }

      const now = new Date();

      switch (normalizedEvent.type) {
        case 'PAYMENT_SUCCEEDED': {
          if (payment) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'PAID',
                settledDate: now,
                providerPaymentId: normalizedEvent.providerPaymentId || payment.providerPaymentId
              }
            });

            // Synchronize linked invoice
            if (payment.invoiceId) {
              await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: {
                  status: 'PAID',
                  paidAt: now
                }
              });
            }

            // Synchronize linked commission transaction to COLLECTED
            await tx.commissionTransaction.updateMany({
              where: { paymentId: payment.id },
              data: {
                status: 'COLLECTED',
                stripePaymentIntentId: normalizedEvent.providerPaymentId || payment.providerPaymentId
              }
            });

            // Record payment attempt
            await tx.paymentAttempt.create({
              data: {
                paymentId: payment.id,
                attemptNumber: 1,
                status: 'SUCCESS',
                providerResponse: {
                  eventId: normalizedEvent.id,
                  type: normalizedEvent.rawType,
                  providerPaymentId: normalizedEvent.providerPaymentId
                }
              }
            });
          }
          break;
        }

        case 'PAYMENT_FAILED': {
          if (payment) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'FAILED',
                failureReason: normalizedEvent.failureReason
              }
            });

            // Record payment attempt failure
            await tx.paymentAttempt.create({
              data: {
                paymentId: payment.id,
                attemptNumber: 1,
                status: 'FAILED',
                failureReason: normalizedEvent.failureReason,
                providerResponse: {
                  eventId: normalizedEvent.id,
                  type: normalizedEvent.rawType
                }
              }
            });
          }
          break;
        }

        case 'PAYMENT_PENDING': {
          if (payment) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'PENDING'
              }
            });
          }
          break;
        }

        case 'PAYMENT_REFUNDED': {
          if (payment) {
            const refundStamp = `[WEBHOOK REFUND ${now.toISOString()}]: ${normalizedEvent.refundReason}`;
            const preservedFailureReason = payment.failureReason
              ? `${payment.failureReason} | ${refundStamp}`
              : refundStamp;

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'REFUNDED',
                failureReason: preservedFailureReason
              }
            });

            if (payment.invoiceId) {
              const currentInv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
              const invNotes = currentInv?.notes
                ? `${currentInv.notes} | ${refundStamp}`
                : refundStamp;

              await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: {
                  status: 'VOID',
                  notes: invNotes
                }
              });
            }

            // Synchronize linked commission transaction to REFUNDED
            await tx.commissionTransaction.updateMany({
              where: { paymentId: payment.id },
              data: { status: 'REFUNDED' }
            });
          }
          break;
        }

        case 'ACCOUNT_UPDATED': {
          if (normalizedEvent.stripeAccountId) {
            const status = (normalizedEvent.chargesEnabled && normalizedEvent.payoutsEnabled) ? 'CONNECTED' : 'SANDBOX';
            const accountStatus = (normalizedEvent.chargesEnabled && normalizedEvent.payoutsEnabled)
              ? 'ACTIVE'
              : (normalizedEvent.detailsSubmitted ? 'PENDING_VERIFICATION' : 'ONBOARDING_REQUIRED');

            await tx.paymentProvider.updateMany({
              where: { stripeAccountId: normalizedEvent.stripeAccountId },
              data: {
                chargesEnabled: normalizedEvent.chargesEnabled,
                payoutsEnabled: normalizedEvent.payoutsEnabled,
                detailsSubmitted: normalizedEvent.detailsSubmitted,
                stripeAccountStatus: accountStatus,
                status
              }
            });
          }
          break;
        }

        case 'TRANSFER_CREATED': {
          if (normalizedEvent.transferId && (payment || normalizedEvent.internalPaymentId)) {
            const targetPayId = payment ? payment.id : normalizedEvent.internalPaymentId;
            await tx.commissionTransaction.updateMany({
              where: { paymentId: targetPayId },
              data: { stripeTransferId: normalizedEvent.transferId }
            });
          }
          break;
        }

        case 'PAYOUT_PAID':
        case 'PAYOUT_FAILED':
        case 'PAYOUT_CREATED': {
          if (targetGymId && normalizedEvent.payoutId) {
            const payoutStatus = normalizedEvent.type === 'PAYOUT_PAID'
              ? 'PAID'
              : (normalizedEvent.type === 'PAYOUT_FAILED' ? 'FAILED' : 'IN_TRANSIT');

            const existingPayout = await tx.payoutRecord.findFirst({
              where: { stripePayoutId: normalizedEvent.payoutId }
            });

            if (existingPayout) {
              await tx.payoutRecord.update({
                where: { id: existingPayout.id },
                data: {
                  status: payoutStatus,
                  failureReason: normalizedEvent.failureReason || null
                }
              });
            } else {
              await tx.payoutRecord.create({
                data: {
                  gymId: targetGymId,
                  stripePayoutId: normalizedEvent.payoutId,
                  stripeAccountId: normalizedEvent.stripeAccountId,
                  amount: normalizedEvent.amount,
                  currency: normalizedEvent.currency,
                  status: payoutStatus,
                  failureReason: normalizedEvent.failureReason || null
                }
              });
            }
          }
          break;
        }

        case 'INVOICE_PAID': {
          if (gymSubscription) {
            const intervalMonths = gymSubscription.billingInterval === 'YEARLY' ? 12 : 1;
            const newPeriodEnd = new Date(now);
            newPeriodEnd.setMonth(newPeriodEnd.getMonth() + intervalMonths);
            const gracePeriodDays = gymSubscription.plan?.gracePeriodDays || 7;
            const gracePeriodEnd = new Date(newPeriodEnd.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

            await tx.gymSubscription.update({
              where: { id: gymSubscription.id },
              data: {
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: newPeriodEnd,
                gracePeriodEnd: gracePeriodEnd,
                cancelledAt: null,
                cancelAtPeriodEnd: false
              }
            });

            await tx.gymSubscriptionInvoice.create({
              data: {
                gymId: targetGymId,
                subscriptionId: gymSubscription.id,
                invoiceNumber: normalizedEvent.invoiceNumber || `SAAS-INV-${Date.now()}`,
                amount: normalizedEvent.amount || gymSubscription.price,
                currency: normalizedEvent.currency || gymSubscription.currency,
                status: 'PAID',
                billingPeriodStart: now,
                billingPeriodEnd: newPeriodEnd,
                paidAt: now,
                stripeInvoiceId: normalizedEvent.invoiceId || null
              }
            });
          } else {
            const invId = invoice ? invoice.id : payment?.invoiceId;
            if (invId) {
              await tx.invoice.update({
                where: { id: invId },
                data: {
                  status: 'PAID',
                  paidAt: now
                }
              });
            }
          }
          break;
        }

        case 'INVOICE_PAYMENT_FAILED': {
          if (gymSubscription) {
            const gracePeriodDays = gymSubscription.plan?.gracePeriodDays || 7;
            const gracePeriodEnd = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

            await tx.gymSubscription.update({
              where: { id: gymSubscription.id },
              data: {
                status: 'PAST_DUE',
                gracePeriodEnd
              }
            });

            await tx.gymSubscriptionInvoice.create({
              data: {
                gymId: targetGymId,
                subscriptionId: gymSubscription.id,
                invoiceNumber: normalizedEvent.invoiceNumber || `SAAS-INV-FAIL-${Date.now()}`,
                amount: normalizedEvent.amount || gymSubscription.price,
                currency: normalizedEvent.currency || gymSubscription.currency,
                status: 'FAILED',
                billingPeriodStart: now,
                billingPeriodEnd: gymSubscription.currentPeriodEnd,
                failureReason: normalizedEvent.failureReason || 'Subscription renewal payment failed'
              }
            });
          } else {
            const invId = invoice ? invoice.id : payment?.invoiceId;
            if (invId) {
              const currentInvoice = await tx.invoice.findUnique({ where: { id: invId } });
              // Only transition to OVERDUE if not already settled as PAID
              if (currentInvoice && currentInvoice.status !== 'PAID') {
                await tx.invoice.update({
                  where: { id: invId },
                  data: {
                    status: 'OVERDUE'
                  }
                });
              }
            }
          }
          break;
        }

        case 'SUBSCRIPTION_CANCELLED': {
          if (gymSubscription) {
            await tx.gymSubscription.update({
              where: { id: gymSubscription.id },
              data: {
                status: 'CANCELLED',
                cancelledAt: now
              }
            });
          } else if (recurringBilling && recurringBilling.status !== 'CANCELLED') {
            await tx.recurringBilling.update({
              where: { id: recurringBilling.id },
              data: {
                status: 'CANCELLED'
              }
            });
          }
          break;
        }
      }

      // 5. Record event in AuditLog for idempotency and audit history
      await tx.auditLog.create({
        data: {
          gymId: targetGymId,
          action: 'WEBHOOK_EVENT_PROCESSED',
          entity: 'WebhookEvent',
          entityId: normalizedEvent.id,
          metadata: {
            provider: normalizedEvent.provider,
            eventType: normalizedEvent.rawType,
            normalizedType: normalizedEvent.type,
            paymentId: payment ? payment.id : null,
            invoiceId: invoice ? invoice.id : payment?.invoiceId || null,
            recurringBillingId: recurringBilling ? recurringBilling.id : null,
            processedAt: now.toISOString()
          }
        }
      });

      return {
        received: true,
        duplicate: false,
        processed: true,
        eventId: normalizedEvent.id,
        status: 'SUCCESS'
      };
    });
  }
}

export default new PaymentWebhookService();
