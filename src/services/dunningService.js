import prisma from '../prisma.js';
import ReminderService from './reminderService.js';
import paymentGateway from './paymentGateway/paymentGateway.js';

export class DunningService {
  /**
   * Helper: Retrieve tenant's billing and retry policy
   */
  static async getTenantBillingPolicy(gymId) {
    const policy = await prisma.billingPolicy.findUnique({
      where: { gymId }
    });

    if (policy) {
      let cadence = [1, 3, 5, 7];
      if (Array.isArray(policy.retryCadenceDays)) {
        cadence = policy.retryCadenceDays;
      }
      return {
        defaultGracePeriodDays: policy.defaultGracePeriodDays || 5,
        retryCadenceDays: cadence,
        latePaymentFee: Number(policy.latePaymentFee) || 15.00
      };
    }

    // Default fallback if policy not yet seeded
    return {
      defaultGracePeriodDays: 5,
      retryCadenceDays: [1, 3, 5, 7],
      latePaymentFee: 15.00
    };
  }

  /**
   * Process and evaluate dunning for a specific failed payment
   * @param {Object} params - { gymId, paymentId, failureReason }
   */
  static async evaluateFailedPayment({ gymId, paymentId, failureReason = 'Card declined by provider' }) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, gymId },
      include: {
        member: true,
        invoice: true,
        paymentAttempts: { orderBy: { attemptNumber: 'asc' } },
        membership: true
      }
    });

    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    // Ledger protection: Never process dunning on an already settled payment
    if (payment.status === 'PAID') {
      return {
        action: 'NONE',
        message: 'Payment has already been settled. Dunning skipped to protect ledger.'
      };
    }

    const policy = await this.getTenantBillingPolicy(gymId);
    const maxRetries = policy.retryCadenceDays.length;
    const currentAttemptCount = payment.paymentAttempts.length;
    const nextAttemptNumber = currentAttemptCount + 1;

    // 1. Atomically update financial and member state in transaction
    const txResult = await prisma.$transaction(async (tx) => {
      // Record payment attempt
      const attempt = await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          attemptNumber: nextAttemptNumber,
          status: 'FAILED',
          failureReason,
          providerResponse: {
            dunningEvaluatedAt: new Date().toISOString(),
            attemptNumber: nextAttemptNumber,
            maxAllowedAttempts: maxRetries
          }
        }
      });

      // Update payment record with failure reason
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason
        }
      });

      let dunningOutcome = {};

      if (nextAttemptNumber <= maxRetries) {
        const daysToNext = policy.retryCadenceDays[nextAttemptNumber - 1] || 1;
        const nextRetryDate = new Date(Date.now() + daysToNext * 24 * 60 * 60 * 1000);

        // Advance linked recurring billing to PAST_DUE if exists
        if (payment.membershipId) {
          await tx.recurringBilling.updateMany({
            where: { membershipId: payment.membershipId, gymId },
            data: {
              status: 'PAST_DUE',
              retryCount: nextAttemptNumber,
              lastRetryDate: new Date()
            }
          });
        }

        dunningOutcome = {
          action: 'RETRY_SCHEDULED',
          attemptNumber: nextAttemptNumber,
          maxRetries,
          nextRetryDate,
          attemptId: attempt.id
        };
      } else {
        // Retries exhausted -> Transition invoice & member to OVERDUE
        if (payment.invoiceId) {
          const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
          // Ledger protection: only mark overdue if not already paid
          if (inv && inv.status !== 'PAID') {
            await tx.invoice.update({
              where: { id: payment.invoiceId },
              data: { status: 'OVERDUE' }
            });
          }
        }

        // Update member status to OVERDUE (verified existing valid enum in schema)
        await tx.member.update({
          where: { id: payment.memberId },
          data: { status: 'OVERDUE' }
        });

        dunningOutcome = {
          action: 'DUNNING_EXHAUSTED',
          attemptNumber: nextAttemptNumber,
          status: 'OVERDUE',
          attemptId: attempt.id
        };
      }

      await tx.auditLog.create({
        data: {
          gymId,
          action: 'DUNNING_EVALUATED',
          entity: 'Payment',
          entityId: payment.id,
          metadata: {
            ...dunningOutcome
          }
        }
      });

      return dunningOutcome;
    });

    // 2. Post-commit: Dispatch appropriate reminder notification
    let reminderId = null;
    try {
      if (txResult.action === 'RETRY_SCHEDULED') {
        const reminder = await ReminderService.createReminder({
          gymId,
          memberId: payment.memberId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          membershipId: payment.membershipId,
          type: 'PAYMENT_FAILED',
          channel: 'EMAIL',
          trigger: `DUNNING_RETRY_STEP_${nextAttemptNumber}`
        });
        reminderId = reminder.id;
      } else if (txResult.action === 'DUNNING_EXHAUSTED') {
        const reminder = await ReminderService.createReminder({
          gymId,
          memberId: payment.memberId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          membershipId: payment.membershipId,
          type: 'OVERDUE',
          channel: 'EMAIL',
          trigger: 'DUNNING_EXHAUSTED_OVERDUE'
        });
        reminderId = reminder.id;
      }
    } catch (reminderErr) {
      console.warn(`[DunningService] Post-commit reminder notice skipped or failed: ${reminderErr.message}`);
    }

    return {
      ...txResult,
      reminderId
    };
  }

  /**
   * Process upcoming payment reminders across all eligible open invoices
   */
  static async processUpcomingPaymentReminders({ gymId }) {
    const policy = await this.getTenantBillingPolicy(gymId);
    const advanceDays = 3;
    const windowEnd = new Date(Date.now() + advanceDays * 24 * 60 * 60 * 1000);

    const openInvoices = await prisma.invoice.findMany({
      where: {
        gymId,
        status: 'OPEN',
        dueDate: {
          gte: new Date(),
          lte: windowEnd
        }
      },
      include: { member: true }
    });

    const results = [];
    for (const inv of openInvoices) {
      try {
        const reminder = await ReminderService.createReminder({
          gymId,
          memberId: inv.memberId,
          invoiceId: inv.id,
          membershipId: inv.membershipId,
          type: 'UPCOMING_PAYMENT',
          channel: 'EMAIL',
          trigger: 'AUTOMATED_UPCOMING_PROCESSOR'
        });
        results.push({ invoiceId: inv.id, reminderId: reminder.id, status: 'PROCESSED' });
      } catch (err) {
        results.push({ invoiceId: inv.id, error: err.message, status: 'SKIPPED' });
      }
    }

    return {
      evaluatedInvoicesCount: openInvoices.length,
      processedCount: results.filter(r => r.status === 'PROCESSED').length,
      results
    };
  }

  /**
   * Process overdue payment reminders for invoices that are past due
   */
  static async processOverduePaymentReminders({ gymId }) {
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        gymId,
        status: 'OVERDUE'
      },
      include: { member: true }
    });

    const results = [];
    for (const inv of overdueInvoices) {
      try {
        const reminder = await ReminderService.createReminder({
          gymId,
          memberId: inv.memberId,
          invoiceId: inv.id,
          membershipId: inv.membershipId,
          type: 'OVERDUE',
          channel: 'EMAIL',
          trigger: 'AUTOMATED_OVERDUE_PROCESSOR'
        });
        results.push({ invoiceId: inv.id, reminderId: reminder.id, status: 'PROCESSED' });
      } catch (err) {
        results.push({ invoiceId: inv.id, error: err.message, status: 'SKIPPED' });
      }
    }

    return {
      evaluatedInvoicesCount: overdueInvoices.length,
      processedCount: results.filter(r => r.status === 'PROCESSED').length,
      results
    };
  }

  /**
   * Process membership expiry reminders (expiring within 7 days)
   */
  static async processMembershipExpiryReminders({ gymId }) {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const expiringMemberships = await prisma.membership.findMany({
      where: {
        gymId,
        status: 'ACTIVE',
        endDate: {
          gte: new Date(),
          lte: sevenDaysFromNow
        }
      },
      include: { member: true, plan: true }
    });

    const results = [];
    for (const ms of expiringMemberships) {
      try {
        const reminder = await ReminderService.createReminder({
          gymId,
          memberId: ms.memberId,
          membershipId: ms.id,
          type: 'MEMBERSHIP_EXPIRY',
          channel: 'EMAIL',
          trigger: 'AUTOMATED_EXPIRY_PROCESSOR'
        });
        results.push({ membershipId: ms.id, reminderId: reminder.id, status: 'PROCESSED' });
      } catch (err) {
        results.push({ membershipId: ms.id, error: err.message, status: 'SKIPPED' });
      }
    }

    return {
      evaluatedMembershipsCount: expiringMemberships.length,
      processedCount: results.filter(r => r.status === 'PROCESSED').length,
      results
    };
  }

  /**
   * Retrieve high-level dunning overview and active failure metrics
   */
  static async getDunningOverview({ gymId }) {
    const [failedPaymentsCount, overdueInvoicesCount, activeDunningSchedules, totalRemindersCount] = await Promise.all([
      prisma.payment.count({ where: { gymId, status: 'FAILED' } }),
      prisma.invoice.count({ where: { gymId, status: 'OVERDUE' } }),
      prisma.recurringBilling.count({ where: { gymId, status: 'PAST_DUE' } }),
      prisma.reminder.count({ where: { gymId } })
    ]);

    const recentAttempts = await prisma.paymentAttempt.findMany({
      where: {
        payment: { gymId }
      },
      take: 10,
      orderBy: { attemptedAt: 'desc' },
      include: {
        payment: {
          select: {
            id: true,
            amount: true,
            member: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        }
      }
    });

    return {
      failedPaymentsCount,
      overdueInvoicesCount,
      activeDunningSchedules,
      totalRemindersCount,
      recentAttempts
    };
  }

  /**
   * Execute an active provider retry charge attempt
   */
  static async executeRetryAttempt({ gymId, paymentId }) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, gymId },
      include: {
        member: {
          include: {
            paymentMethods: {
              where: { status: 'ACTIVE' },
              orderBy: { isDefault: 'desc' }
            }
          }
        },
        invoice: true,
        paymentAttempts: { orderBy: { attemptNumber: 'asc' } },
        membership: true
      }
    });

    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    if (payment.status === 'PAID') {
      return { success: true, status: 'ALREADY_SETTLED', message: 'Payment is already settled.' };
    }

    const policy = await this.getTenantBillingPolicy(gymId);
    const maxRetries = policy.retryCadenceDays.length;
    const nextAttemptNumber = payment.paymentAttempts.length + 1;
    const paymentMethod = payment.paymentMethodId
      ? await prisma.paymentMethod.findFirst({ where: { id: payment.paymentMethodId, gymId } })
      : (payment.member.paymentMethods[0] || null);

    const chargeRes = await paymentGateway.retryPayment({
      amount: payment.amount,
      currency: payment.currency,
      paymentMethodType: paymentMethod ? paymentMethod.type : 'CARD',
      providerPaymentMethodId: paymentMethod ? paymentMethod.providerPaymentMethodId : null,
      customerId: payment.memberId,
      attemptNumber: nextAttemptNumber
    });

    const now = new Date();

    if (chargeRes.status === 'PAID') {
      // Successful retry: Restore financial health atomically
      await prisma.$transaction([
        prisma.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            attemptNumber: nextAttemptNumber,
            status: 'SUCCESS',
            failureReason: null,
            providerResponse: { providerPaymentId: chargeRes.providerPaymentId, status: 'PAID' }
          }
        }),
        prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', settledDate: now, providerPaymentId: chargeRes.providerPaymentId, failureReason: null }
        }),
        ...(payment.invoiceId ? [
          prisma.invoice.update({
            where: { id: payment.invoiceId },
            data: { status: 'PAID', paidAt: now }
          })
        ] : []),
        ...(payment.membershipId ? [
          prisma.recurringBilling.updateMany({
            where: { membershipId: payment.membershipId, gymId },
            data: { status: 'ACTIVE', retryCount: 0 }
          })
        ] : []),
        prisma.member.update({
          where: { id: payment.memberId },
          data: { status: 'ACTIVE' }
        }),
        prisma.auditLog.create({
          data: {
            gymId,
            action: 'DUNNING_RETRY_SUCCESS',
            entity: 'Payment',
            entityId: payment.id,
            metadata: { attemptNumber: nextAttemptNumber, providerPaymentId: chargeRes.providerPaymentId }
          }
        })
      ]);

      return { success: true, status: 'PAID', attemptNumber: nextAttemptNumber };
    } else {
      // Failed retry: Record failure and evaluate exhaustion
      const isExhausted = nextAttemptNumber >= maxRetries;
      const failureReason = chargeRes.failureReason || 'Provider retry charge declined';

      await prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            attemptNumber: nextAttemptNumber,
            status: 'FAILED',
            failureReason,
            providerResponse: { error: failureReason, attemptNumber: nextAttemptNumber }
          }
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: { failureReason }
        });

        if (isExhausted) {
          // Apply late fee to invoice if not already applied
          if (payment.invoiceId && policy.latePaymentFee > 0) {
            const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
            if (inv && inv.status !== 'PAID' && !inv.notes?.includes('[LATE FEE APPLIED]')) {
              const newTotal = Number(inv.total) + policy.latePaymentFee;
              await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: {
                  status: 'OVERDUE',
                  total: newTotal,
                  notes: inv.notes ? `${inv.notes} | [LATE FEE APPLIED: $${policy.latePaymentFee.toFixed(2)}]` : `[LATE FEE APPLIED: $${policy.latePaymentFee.toFixed(2)}]`
                }
              });
            } else if (inv && inv.status !== 'PAID') {
              await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: { status: 'OVERDUE' }
              });
            }
          }

          await tx.member.update({
            where: { id: payment.memberId },
            data: { status: 'OVERDUE' }
          });

          await tx.auditLog.create({
            data: {
              gymId,
              action: 'DUNNING_EXHAUSTED',
              entity: 'Payment',
              entityId: payment.id,
              metadata: { attemptNumber: nextAttemptNumber, maxRetries, lateFeeApplied: policy.latePaymentFee }
            }
          });
        }
      });

      return {
        success: false,
        status: isExhausted ? 'DUNNING_EXHAUSTED' : 'RETRY_SCHEDULED',
        attemptNumber: nextAttemptNumber,
        failureReason
      };
    }
  }
}

export default DunningService;
