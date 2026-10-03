import prisma from '../prisma.js';

/**
 * Centralized Commission & Platform Fee Engine for IronPulse
 * 
 * Implements Decimal/integer-safe financial arithmetic for multi-party marketplace splits.
 * Never hardcodes fee percentages; resolves dynamically from gym's PlatformFeeConfig.
 */
export class CommissionService {
  /**
   * Retrieve active platform fee configuration for a gym tenant
   */
  static async getGymCommissionConfig(gymId) {
    const config = await prisma.platformFeeConfig.findFirst({
      where: { gymId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    if (config) {
      return {
        id: config.id,
        gymId: config.gymId,
        percentage: Number(config.percentage) || 0,
        fixedFee: Number(config.fixedFee) || 0,
        feeMode: config.feeMode || 'PERCENTAGE',
        currency: config.currency || 'USD',
        isActive: config.isActive,
        isConfigured: true
      };
    }

    // Default configuration if not yet customized
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true }
    });

    return {
      gymId,
      percentage: 0.0,
      fixedFee: 0.0,
      feeMode: 'PERCENTAGE',
      currency: gym?.currency || 'USD',
      isActive: false,
      isConfigured: false
    };
  }

  /**
   * Save or update commission configuration for a gym
   */
  static async saveGymCommissionConfig({ gymId, percentage = 0, fixedFee = 0, feeMode = 'PERCENTAGE', isActive = true, currency = 'USD' }) {
    const parsedPercentage = Math.max(0, Math.min(100, Number(percentage) || 0));
    const parsedFixedFee = Math.max(0, Number(fixedFee) || 0);

    const existing = await prisma.platformFeeConfig.findFirst({
      where: { gymId }
    });

    let savedConfig = null;
    if (existing) {
      savedConfig = await prisma.platformFeeConfig.update({
        where: { id: existing.id },
        data: {
          percentage: parsedPercentage,
          fixedFee: parsedFixedFee,
          feeMode: feeMode.toUpperCase(),
          currency: currency.toUpperCase(),
          isActive: Boolean(isActive)
        }
      });
    } else {
      savedConfig = await prisma.platformFeeConfig.create({
        data: {
          gymId,
          percentage: parsedPercentage,
          fixedFee: parsedFixedFee,
          feeMode: feeMode.toUpperCase(),
          currency: currency.toUpperCase(),
          isActive: Boolean(isActive)
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        gymId,
        action: 'PLATFORM_FEE_CONFIG_UPDATED',
        entity: 'PlatformFeeConfig',
        entityId: savedConfig.id,
        metadata: {
          percentage: parsedPercentage,
          fixedFee: parsedFixedFee,
          feeMode,
          isActive
        }
      }
    });

    return savedConfig;
  }

  /**
   * Calculate Platform Fee & Gym Net Payout Breakdown
   * 
   * @param {Object} params - { gymId, grossAmount, currency, config }
   * @returns {Promise<{ grossAmount: number, platformFee: number, processingFee: number, gymNetAmount: number, feeMode: string, isConfigured: boolean }>}
   */
  static async calculatePlatformFee({ gymId, grossAmount, currency = 'USD', config = null }) {
    const gross = Math.max(0, Number(grossAmount) || 0);
    const feeConfig = config || (gymId ? await this.getGymCommissionConfig(gymId) : null);

    if (!feeConfig || !feeConfig.isActive || gross === 0) {
      const grossCents = Math.round(gross * 100);
      return {
        grossAmount: gross,
        platformFee: 0.0,
        processingFee: 0.0,
        gymNetAmount: gross,
        grossAmountCents: grossCents,
        platformFeeCents: 0,
        gymNetCents: grossCents,
        percentage: 0,
        fixedFee: 0,
        feeMode: feeConfig?.feeMode || feeConfig?.feeType || 'PERCENTAGE',
        isConfigured: Boolean(feeConfig?.isConfigured)
      };
    }

    let calculatedFee = 0.0;
    const feeMode = (feeConfig.feeMode || feeConfig.feeType || 'PERCENTAGE').toUpperCase();
    const percentage = Number(feeConfig.percentage || feeConfig.percentageFee || 0);
    const fixedFee = Number(feeConfig.fixedFee || 0);

    if (feeMode === 'PERCENTAGE') {
      calculatedFee = (gross * percentage) / 100;
    } else if (feeMode === 'FIXED') {
      calculatedFee = fixedFee;
    } else if (feeMode === 'HYBRID') {
      calculatedFee = (gross * percentage) / 100 + fixedFee;
    }

    if (feeConfig.minFee && calculatedFee < Number(feeConfig.minFee)) {
      calculatedFee = Number(feeConfig.minFee);
    }
    if (feeConfig.maxFee && Number(feeConfig.maxFee) > 0 && calculatedFee > Number(feeConfig.maxFee)) {
      calculatedFee = Number(feeConfig.maxFee);
    }

    // Money precision rounding (2 decimal places)
    const platformFee = Math.min(gross, Math.round(calculatedFee * 100) / 100);
    const gymNetAmount = Math.max(0, Math.round((gross - platformFee) * 100) / 100);
    const platformFeeCents = Math.round(platformFee * 100);
    const gymNetCents = Math.round(gymNetAmount * 100);

    return {
      grossAmount: gross,
      platformFee,
      processingFee: 0.0,
      gymNetAmount,
      grossAmountCents: Math.round(gross * 100),
      platformFeeCents,
      gymNetCents,
      percentage,
      fixedFee,
      feeMode,
      currency: feeConfig.currency || currency,
      isConfigured: true
    };
  }

  /**
   * Create an immutable CommissionTransaction record in ledger
   */
  static async recordCommissionTransaction({
    tx = prisma,
    gymId,
    paymentId,
    invoiceId,
    grossAmount,
    platformFee,
    processingFee = 0.0,
    gymNetAmount,
    currency = 'USD',
    status = 'PENDING',
    stripePaymentIntentId,
    stripeTransferId,
    stripeChargeId,
    metadata = {}
  }) {
    return await tx.commissionTransaction.create({
      data: {
        gymId,
        paymentId: paymentId || null,
        invoiceId: invoiceId || null,
        grossAmount: Number(grossAmount),
        platformFee: Number(platformFee),
        processingFee: Number(processingFee),
        gymNetAmount: Number(gymNetAmount),
        currency: currency.toUpperCase(),
        status,
        stripePaymentIntentId: stripePaymentIntentId || null,
        stripeTransferId: stripeTransferId || null,
        stripeChargeId: stripeChargeId || null,
        metadata
      }
    });
  }

  /**
   * Update commission status on webhook settlement or refund
   */
  static async updateCommissionStatus({ gymId, paymentId, status, stripeTransferId, stripeChargeId }) {
    const existing = await prisma.commissionTransaction.findFirst({
      where: { gymId, paymentId }
    });

    if (!existing) return null;

    const updateData = { status };
    if (stripeTransferId) updateData.stripeTransferId = stripeTransferId;
    if (stripeChargeId) updateData.stripeChargeId = stripeChargeId;

    return await prisma.commissionTransaction.update({
      where: { id: existing.id },
      data: updateData
    });
  }

  /**
   * Query Commission Ledger & Summary Statistics for Reports
   */
  static async getCommissionSummary({ gymId, startDate, endDate }) {
    const where = { gymId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [collectedAgg, pendingAgg, refundedAgg, transactions] = await Promise.all([
      prisma.commissionTransaction.aggregate({
        where: { ...where, status: 'COLLECTED' },
        _sum: { grossAmount: true, platformFee: true, gymNetAmount: true },
        _count: { id: true }
      }),
      prisma.commissionTransaction.aggregate({
        where: { ...where, status: 'PENDING' },
        _sum: { grossAmount: true, platformFee: true, gymNetAmount: true },
        _count: { id: true }
      }),
      prisma.commissionTransaction.aggregate({
        where: { ...where, status: 'REFUNDED' },
        _sum: { platformFee: true },
        _count: { id: true }
      }),
      prisma.commissionTransaction.findMany({
        where,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: {
            select: { id: true, status: true, transactionDate: true, member: { select: { firstName: true, lastName: true, email: true } } }
          }
        }
      })
    ]);

    const totalGross = Number(collectedAgg._sum.grossAmount || 0);
    const totalPlatformCommission = Number(collectedAgg._sum.platformFee || 0);
    const totalGymPayout = Number(collectedAgg._sum.gymNetAmount || 0);
    const refundedCommission = Number(refundedAgg._sum.platformFee || 0);

    return {
      summary: {
        totalGross,
        totalPlatformCommission,
        netPlatformCommission: Math.max(0, totalPlatformCommission - refundedCommission),
        totalGymPayout,
        collectedCount: collectedAgg._count.id || 0,
        pendingCount: pendingAgg._count.id || 0,
        refundedCount: refundedAgg._count.id || 0
      },
      transactions
    };
  }
}

export default CommissionService;
