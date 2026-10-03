import prisma from '../prisma.js';
import paymentGateway from './paymentGateway/paymentGateway.js';
import CommissionService from './commissionService.js';

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
          },
          commissionTransactions: {
            take: 1
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
        },
        commissionTransactions: true
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

    let paymentCurrency = data.currency ? data.currency.toUpperCase() : null;
    if (!paymentCurrency) {
      const gymRecord = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { currency: true, paymentMode: true }
      });
      paymentCurrency = (gymRecord?.currency || 'USD').toUpperCase();
    }

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
        currency: paymentCurrency,
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
   * Execute an electronic charge with automatic Connect / Direct-Merchant resolution
   */
  async executeCharge({
    gymId,
    memberId,
    invoiceId,
    membershipId,
    paymentMethodId,
    amount,
    currency = 'USD',
    description,
    metadata = {}
  }) {
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        paymentProviders: {
          where: { provider: 'STRIPE' }
        }
      }
    });

    const isConnectMode = gym?.paymentMode === 'CONNECT_PLATFORM';
    const provider = gym?.paymentProviders?.[0];
    const connectedAccountId = (isConnectMode && provider?.stripeAccountId) ? provider.stripeAccountId : null;

    let commission = { platformFee: 0, gymNetAmount: Number(amount) };
    if (isConnectMode) {
      commission = await CommissionService.calculatePlatformFee({
        gymId,
        grossAmount: Number(amount),
        currency
      });
    }

    // Resolve payment method
    let paymentMethod = null;
    if (paymentMethodId) {
      paymentMethod = await prisma.paymentMethod.findFirst({
        where: { id: paymentMethodId, gymId }
      });
    } else {
      paymentMethod = await prisma.paymentMethod.findFirst({
        where: { memberId, gymId, status: 'ACTIVE' },
        orderBy: { isDefault: 'desc' }
      });
    }

    const now = new Date();

    // Create initial payment record (PENDING)
    const payment = await prisma.payment.create({
      data: {
        gymId,
        memberId,
        membershipId: membershipId || null,
        invoiceId: invoiceId || null,
        paymentMethodId: paymentMethod?.id || null,
        amount: Number(amount),
        currency: currency.toUpperCase(),
        status: 'PENDING',
        paymentMethodType: paymentMethod?.type || 'CARD',
        provider: 'STRIPE',
        transactionDate: now
      }
    });

    // Execute charge via Gateway
    const chargeRes = await paymentGateway.createCharge({
      amount: Number(amount),
      currency,
      paymentMethodType: paymentMethod?.type || 'CARD',
      providerPaymentMethodId: paymentMethod?.providerPaymentMethodId,
      customerId: memberId,
      description: description || `IronPulse Charge - ${gym?.legalName || 'Gym'}`,
      connectedAccountId,
      applicationFeeAmount: isConnectMode ? commission.platformFee : null,
      metadata: {
        gymId,
        paymentId: payment.id,
        invoiceId: invoiceId || '',
        ...metadata
      }
    });

    if (chargeRes.status === 'PAID') {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            settledDate: now,
            providerPaymentId: chargeRes.providerPaymentId
          }
        });

        if (invoiceId) {
          await tx.invoice.update({
            where: { id: invoiceId },
            data: { status: 'PAID', paidAt: now }
          });
        }

        if (isConnectMode && commission.platformFee >= 0) {
          await CommissionService.recordCommissionTransaction({
            tx,
            gymId,
            paymentId: payment.id,
            invoiceId,
            grossAmount: Number(amount),
            platformFee: commission.platformFee,
            gymNetAmount: commission.gymNetAmount,
            currency,
            status: 'COLLECTED',
            stripePaymentIntentId: chargeRes.providerPaymentId,
            stripeTransferId: chargeRes.transferId,
            stripeChargeId: chargeRes.chargeId
          });
        }

        await tx.auditLog.create({
          data: {
            gymId,
            action: 'PAYMENT_CHARGED_SUCCESS',
            entity: 'Payment',
            entityId: payment.id,
            metadata: {
              amount: Number(amount),
              currency,
              paymentMode: isConnectMode ? 'CONNECT_PLATFORM' : 'DIRECT_MERCHANT',
              platformFee: isConnectMode ? commission.platformFee : 0,
              providerPaymentId: chargeRes.providerPaymentId
            }
          }
        });
      });

      return {
        success: true,
        status: 'PAID',
        paymentId: payment.id,
        providerPaymentId: chargeRes.providerPaymentId
      };
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: chargeRes.failureReason || 'Card charge declined by gateway'
        }
      });

      return {
        success: false,
        status: chargeRes.status,
        paymentId: payment.id,
        failureReason: chargeRes.failureReason
      };
    }
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

      // Log financial settlement in AuditLog
      await tx.auditLog.create({
        data: {
          gymId,
          action: 'PAYMENT_SETTLED',
          entity: 'Payment',
          entityId: paymentId,
          metadata: {
            amount: Number(existing.amount),
            currency: existing.currency,
            invoiceId: existing.invoiceId,
            settlementReference: settlementReference || updatedPayment.providerPaymentId,
            settledDate: now.toISOString()
          }
        }
      });

      return updatedPayment;
    });
  }

  /**
   * Refund an eligible paid payment while preserving original audit history and synchronizing invoice and commission
   */
  async refundPayment({ gymId, paymentId, reason }) {
    const existing = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        gymId
      },
      include: {
        invoice: true,
        commissionTransactions: true
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

    const isConnectPayment = existing.commissionTransactions && existing.commissionTransactions.length > 0;

    // If payment was settled via an external provider, invoke Gateway refund first
    if (existing.providerPaymentId && !existing.providerPaymentId.startsWith('MANUAL-') && !existing.providerPaymentId.startsWith('CASH-')) {
      const gatewayRefund = await paymentGateway.refundPayment({
        providerPaymentId: existing.providerPaymentId,
        amount: existing.amount,
        reason: reason || 'Manual refund processed by admin',
        reverseTransfer: isConnectPayment
      });

      if (!gatewayRefund.success && gatewayRefund.configured) {
        const error = new Error(`Payment provider rejected refund: ${gatewayRefund.error || 'Unknown gateway error'}`);
        error.statusCode = 502;
        throw error;
      }
    }

    // Preserve original settlement history and append refund audit note
    const now = new Date();
    const refundStamp = `[REFUNDED ${now.toISOString()}] ${reason || 'Manual refund processed by admin'}`;
    const preservedHistory = existing.failureReason
      ? `${existing.failureReason} | ${refundStamp}`
      : refundStamp;

    return await prisma.$transaction(async (tx) => {
      // 1. Update Payment status to REFUNDED
      const refundedPayment = await tx.payment.update({
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

      // 2. Synchronize linked Invoice: transition to VOID with audit notes
      if (existing.invoiceId) {
        const invNotes = existing.invoice?.notes
          ? `${existing.invoice.notes} | ${refundStamp}`
          : refundStamp;

        await tx.invoice.update({
          where: { id: existing.invoiceId },
          data: {
            status: 'VOID',
            notes: invNotes
          }
        });
      }

      // 3. Update Commission ledger status to REFUNDED if applicable
      if (isConnectPayment) {
        await tx.commissionTransaction.updateMany({
          where: { paymentId },
          data: { status: 'REFUNDED' }
        });
      }

      // 4. Record financial mutation in AuditLog
      await tx.auditLog.create({
        data: {
          gymId,
          action: 'PAYMENT_REFUNDED',
          entity: 'Payment',
          entityId: paymentId,
          metadata: {
            amount: Number(existing.amount),
            currency: existing.currency,
            invoiceId: existing.invoiceId,
            reason: reason || 'Manual refund processed by admin',
            refundedAt: now.toISOString()
          }
        }
      });

      return refundedPayment;
    });
  }

  /**
   * Record Member Payment (CASH or QR CODE)
   * Atomic direct settlement: Updates payment status to PAID, synchronizes linked invoice to PAID,
   * creates payment attempt and immutable audit log. Does NOT invoke external Stripe gateway.
   */
  async recordMemberPayment({
    gymId,
    userId,
    memberId,
    invoiceId,
    membershipId,
    amount,
    paymentMethodType = 'CASH',
    settlementReference,
    notes
  }) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      const error = new Error('Amount must be a positive number greater than 0');
      error.statusCode = 400;
      throw error;
    }

    // 1. Verify Member exists and belongs strictly to authenticated gym
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId }
    });

    if (!member) {
      const error = new Error('Member not found in the authenticated gym');
      error.statusCode = 404;
      throw error;
    }

    // 2. If invoiceId provided, verify it belongs strictly to authenticated gym
    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, gymId }
      });

      if (!invoice) {
        const error = new Error('Invoice not found in the authenticated gym');
        error.statusCode = 404;
        throw error;
      }
    }

    // 3. If membershipId provided, verify it belongs strictly to authenticated gym
    if (membershipId) {
      const membership = await prisma.membership.findFirst({
        where: { id: membershipId, gymId }
      });

      if (!membership) {
        const error = new Error('Membership not found in the authenticated gym');
        error.statusCode = 404;
        throw error;
      }
    }

    const gymRecord = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true, legalName: true }
    });

    const paymentCurrency = (gymRecord?.currency || 'USD').toUpperCase();
    const cleanMethod = String(paymentMethodType || 'CASH').toUpperCase();
    const isQr = cleanMethod === 'QR' || cleanMethod === 'QR_CODE';
    const isCash = cleanMethod === 'CASH';

    const now = new Date();
    const refCode = settlementReference
      ? String(settlementReference).trim()
      : `${isQr ? 'QR' : (isCash ? 'CASH' : 'COUNTER')}-${now.getTime()}`;

    const adminNote = isQr
      ? `QR Payment [Admin Confirmed]${notes ? ` | Notes: ${notes}` : ''}`
      : `Cash Payment [In-Person Counter]${notes ? ` | Notes: ${notes}` : ''}`;

    // Execute atomic settlement in Prisma Transaction
    return await prisma.$transaction(async (tx) => {
      // A. Create settled Payment Record
      const payment = await tx.payment.create({
        data: {
          gymId,
          memberId,
          membershipId: membershipId || invoice?.membershipId || null,
          invoiceId: invoiceId || null,
          amount: Number(amount),
          currency: paymentCurrency,
          status: 'PAID',
          paymentMethodType: isCash ? 'CASH' : 'POS',
          provider: isQr ? 'QR_CODE' : 'CASH',
          providerPaymentId: refCode,
          failureReason: adminNote,
          transactionDate: now,
          settledDate: now
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
          }
        }
      });

      // B. If invoice exists, transition invoice to PAID
      if (invoiceId) {
        const invNoteStamp = `[PAID ${now.toISOString()}] Settled via ${isQr ? 'QR Code' : 'Cash'} (Ref: ${refCode})`;
        const updatedNotes = invoice.notes
          ? `${invoice.notes} | ${invNoteStamp}`
          : invNoteStamp;

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'PAID',
            paidAt: now,
            notes: updatedNotes
          }
        });
      }

      // C. Record PaymentAttempt as SUCCESS
      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          attemptNumber: 1,
          status: 'SUCCESS',
          attemptedAt: now,
          providerResponse: {
            method: isQr ? 'QR_CODE' : 'CASH',
            recordedByUserId: userId || null,
            reference: refCode,
            confirmedAt: now.toISOString()
          }
        }
      });

      // D. Record Compliance in AuditLog
      await tx.auditLog.create({
        data: {
          gymId,
          userId: userId || null,
          action: isQr ? 'MEMBER_QR_PAYMENT_RECORDED' : 'MEMBER_CASH_PAYMENT_RECORDED',
          entity: 'Payment',
          entityId: payment.id,
          metadata: {
            amount: Number(amount),
            currency: paymentCurrency,
            paymentMethod: isQr ? 'QR' : 'CASH',
            invoiceId: invoiceId || null,
            memberId,
            reference: refCode
          }
        }
      });

      return payment;
    });
  }
}

export default new PaymentService();

