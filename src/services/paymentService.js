import prisma from '../prisma.js';
import paymentGateway from './paymentGateway/paymentGateway.js';

class PaymentService {
  /**
   * List payments with pagination, filters, sorting
   */
  async getPayments({
    gymId,
    page = 1,
    limit = 20,
    memberId,
    invoiceId,
    status,
    paymentMethodType,
    fromDate,
    toDate,
    sortBy = 'transactionDate',
    sortOrder = 'desc'
  }) {
    const skip = (page - 1) * limit;

    const where = {
      gymId
    };

    if (memberId) {
      where.memberId = memberId;
    }

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (status) {
      where.status = status;
    }

    if (paymentMethodType) {
      where.paymentMethodType = paymentMethodType;
    }

    if (fromDate || toDate) {
      where.transactionDate = {};
      if (fromDate) where.transactionDate.gte = fromDate;
      if (toDate) where.transactionDate.lte = toDate;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder
        },
        include: {
          member: {
            select: {
              id: true,
              memberId: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              status: true
            }
          },
          paymentMethod: {
            select: {
              id: true,
              type: true,
              brand: true,
              last4: true
            }
          }
        }
      }),
      prisma.payment.count({ where })
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single payment by ID (tenant-scoped)
   */
  async getPaymentById({ gymId, paymentId }) {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        gymId
      },
      include: {
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            subtotal: true,
            tax: true,
            total: true,
            dueDate: true,
            status: true,
            paidAt: true
          }
        },
        paymentMethod: {
          select: {
            id: true,
            type: true,
            brand: true,
            last4: true,
            expMonth: true,
            expYear: true,
            isDefault: true,
            status: true
          }
        },
        paymentAttempts: {
          orderBy: {
            attemptedAt: 'desc'
          }
        }
      }
    });

    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    return payment;
  }

  /**
   * Create payment ledger record (status starts as PENDING or FAILED, never trusted PAID directly)
   */
  async createPayment({ gymId, data }) {
    // 1. Verify member belongs to current gym
    const member = await prisma.member.findFirst({
      where: {
        id: data.memberId,
        gymId
      }
    });

    if (!member) {
      const error = new Error('Member not found in current gym');
      error.statusCode = 404;
      throw error;
    }

    // 2. If invoiceId provided, verify it belongs to current gym
    if (data.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: data.invoiceId,
          gymId
        }
      });

      if (!invoice) {
        const error = new Error('Invoice not found in current gym');
        error.statusCode = 404;
        throw error;
      }
    }

    // 3. If membershipId provided, verify it belongs to current gym
    if (data.membershipId) {
      const membership = await prisma.membership.findFirst({
        where: {
          id: data.membershipId,
          gymId
        }
      });

      if (!membership) {
        const error = new Error('Membership not found in current gym');
        error.statusCode = 404;
        throw error;
      }
    }

    // 4. If paymentMethodId provided, verify it belongs to current gym
    if (data.paymentMethodId) {
      const paymentMethod = await prisma.paymentMethod.findFirst({
        where: {
          id: data.paymentMethodId,
          gymId
        }
      });

      if (!paymentMethod) {
        const error = new Error('Payment method not found in current gym');
        error.statusCode = 404;
        throw error;
      }
    }

    const initialStatus = data.status === 'FAILED' ? 'FAILED' : 'PENDING';
    const amount = Number(data.amount);

    const payment = await prisma.payment.create({
      data: {
        gymId,
        memberId: data.memberId,
        membershipId: data.membershipId || null,
        invoiceId: data.invoiceId || null,
        paymentMethodId: data.paymentMethodId || null,
        provider: data.provider || 'MANUAL',
        providerPaymentId: data.providerPaymentId || null,
        amount,
        currency: data.currency ? data.currency.toUpperCase() : 'USD',
        status: initialStatus,
        paymentMethodType: data.paymentMethodType || 'CARD',
        failureReason: data.failureReason ? data.failureReason.trim() : null,
        transactionDate: data.transactionDate ? new Date(data.transactionDate) : new Date()
      },
      include: {
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true
          }
        }
      }
    });

    return payment;
  }

  /**
   * Manually settle an eligible payment atomically
   */
  async manualSettle({ gymId, paymentId, settlementReference, notes }) {
    const existing = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'PAID') {
      const error = new Error('Payment has already been settled');
      error.statusCode = 409;
      throw error;
    }

    if (existing.status === 'REFUNDED') {
      const error = new Error('Cannot settle a refunded payment');
      error.statusCode = 409;
      throw error;
    }

    // Atomic transaction for payment settlement + invoice status update
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          settledDate: now,
          providerPaymentId: settlementReference || existing.providerPaymentId || `MANUAL-${now.getTime()}`,
          failureReason: notes ? (existing.failureReason ? `${existing.failureReason} | Notes: ${notes}` : `Notes: ${notes}`) : existing.failureReason
        },
        include: {
          member: {
            select: {
              id: true,
              memberId: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          invoice: true
        }
      });

      // If associated with an invoice, mark invoice as PAID atomically
      if (existing.invoiceId) {
        await tx.invoice.update({
          where: { id: existing.invoiceId },
          data: {
            status: 'PAID',
            paidAt: now
          }
        });
      }

      return updatedPayment;
    });
  }

  /**
   * Refund an eligible paid payment while preserving original audit history
   */
  async refundPayment({ gymId, paymentId, reason }) {
    const existing = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'REFUNDED') {
      const error = new Error('Payment has already been refunded');
      error.statusCode = 409;
      throw error;
    }

    if (existing.status !== 'PAID') {
      const error = new Error(`Only settled (PAID) payments can be refunded. Current status is '${existing.status}'`);
      error.statusCode = 400;
      throw error;
    }

    // If payment was settled via an external provider, invoke Gateway refund first
    if (existing.providerPaymentId && !existing.providerPaymentId.startsWith('MANUAL-')) {
      const gatewayRefund = await paymentGateway.refundPayment({
        providerPaymentId: existing.providerPaymentId,
        amount: existing.amount,
        reason: reason || 'Manual refund processed by admin'
      });

      if (!gatewayRefund.success && gatewayRefund.configured) {
        const error = new Error(`Payment provider rejected refund: ${gatewayRefund.error || 'Unknown gateway error'}`);
        error.statusCode = 502;
        throw error;
      }
    }

    // Preserve original settlement history and append refund audit note to failureReason field
    const refundStamp = `[REFUNDED ${new Date().toISOString()}] ${reason || 'Manual refund processed by admin'}`;
    const preservedHistory = existing.failureReason
      ? `${existing.failureReason} | ${refundStamp}`
      : refundStamp;

    const refunded = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
        failureReason: preservedHistory
      },
      include: {
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        invoice: true
      }
    });

    return refunded;
  }
}

export default new PaymentService();
