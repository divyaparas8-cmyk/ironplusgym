import prisma from '../prisma.js';
import GymSubscriptionService from './gymSubscriptionService.js';

export class SuperAdminService {
  /**
   * Get Platform-wide Dashboard Metrics (all live calculated from DB)
   */
  static async getDashboardMetrics() {
    const totalGyms = await prisma.gym.count();

    // Group subscriptions by status
    const subscriptions = await prisma.gymSubscription.findMany({
      include: { plan: true }
    });

    let activeGyms = 0;
    let trialGyms = 0;
    let pastDueGyms = 0;
    let expiredGyms = 0;
    let mrr = 0;

    for (const sub of subscriptions) {
      if (sub.status === 'ACTIVE') {
        activeGyms++;
        const monthlyAmount = sub.billingInterval === 'YEARLY'
          ? Number(sub.price) / 12
          : Number(sub.price);
        mrr += monthlyAmount;
      } else if (sub.status === 'TRIALING') {
        trialGyms++;
      } else if (sub.status === 'PAST_DUE' || sub.status === 'GRACE_PERIOD') {
        pastDueGyms++;
      } else if (sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
        expiredGyms++;
      }
    }

    // Subscription Revenue (sum of paid SaaS invoices)
    const paidSaasInvoices = await prisma.gymSubscriptionInvoice.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
      _count: { id: true }
    });
    const subscriptionRevenue = Number(paidSaasInvoices._sum.amount || 0);

    // Failed Subscription Payments count
    const failedSubscriptionPayments = await prisma.gymSubscriptionInvoice.count({
      where: { status: 'FAILED' }
    });

    // Student Payment Transaction Volume
    const studentPayments = await prisma.payment.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
      _count: { id: true }
    });
    const paymentTransactionVolume = Number(studentPayments._sum.amount || 0);
    const totalPaymentCount = studentPayments._count.id;

    // Platform Commission
    const commissions = await prisma.commissionTransaction.aggregate({
      where: { status: 'COLLECTED' },
      _sum: { platformFee: true, processingFee: true }
    });
    const platformCommission = Number(commissions._sum.platformFee || 0);

    // Gym Payouts
    const payouts = await prisma.payoutRecord.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true }
    });
    const gymPayouts = Number(payouts._sum.amount || 0);

    // Recent Gyms
    const recentGyms = await prisma.gym.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: { plan: true }
        },
        users: {
          where: { role: 'OWNER' },
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Recent Subscription Invoices
    const recentInvoices = await prisma.gymSubscriptionInvoice.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        gym: {
          select: { id: true, legalName: true, tradeName: true, contactEmail: true }
        }
      }
    });

    return {
      totalGyms,
      activeGyms,
      trialGyms,
      pastDueGyms,
      expiredGyms,
      mrr: Number(mrr.toFixed(2)),
      subscriptionRevenue: Number(subscriptionRevenue.toFixed(2)),
      paymentTransactionVolume: Number(paymentTransactionVolume.toFixed(2)),
      totalPaymentCount,
      platformCommission: Number(platformCommission.toFixed(2)),
      gymPayouts: Number(gymPayouts.toFixed(2)),
      failedSubscriptionPayments,
      recentGyms,
      recentInvoices
    };
  }

  /**
   * List all Gyms with pagination, searching and status filtering
   */
  static async listGyms({ search = '', status = '', page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const where = {};
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { legalName: { contains: q } },
        { tradeName: { contains: q } },
        { contactEmail: { contains: q } },
        { phone: { contains: q } }
      ];
    }

    if (status && status !== 'ALL') {
      where.subscription = {
        status: status.toUpperCase()
      };
    }

    const [gyms, total] = await Promise.all([
      prisma.gym.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          subscription: {
            include: { plan: true }
          },
          users: {
            where: { role: 'OWNER' },
            select: { id: true, name: true, email: true }
          },
          paymentProviders: {
            select: { provider: true, status: true, chargesEnabled: true, payoutsEnabled: true, stripeAccountId: true }
          },
          _count: {
            select: { members: true, payments: true, invoices: true }
          }
        }
      }),
      prisma.gym.count({ where })
    ]);

    return {
      gyms,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * Get single gym detailed profile for Super Admin
   */
  static async getGymDetails(gymId) {
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        subscription: {
          include: {
            plan: true,
            invoices: {
              take: 10,
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        users: {
          select: { id: true, name: true, email: true, role: true, status: true, createdAt: true }
        },
        paymentProviders: true,
        billingPolicy: true,
        platformFeeConfigs: true,
        _count: {
          select: {
            members: true,
            memberships: true,
            payments: true,
            invoices: true,
            recurringBillings: true
          }
        }
      }
    });

    if (!gym) {
      const error = new Error('Gym not found');
      error.statusCode = 404;
      throw error;
    }

    // Aggregate financial performance
    const paymentAgg = await prisma.payment.aggregate({
      where: { gymId, status: 'PAID' },
      _sum: { amount: true }
    });

    const commissionAgg = await prisma.commissionTransaction.aggregate({
      where: { gymId, status: 'COLLECTED' },
      _sum: { platformFee: true, processingFee: true, gymNetAmount: true }
    });

    return {
      ...gym,
      metrics: {
        totalRevenue: Number(paymentAgg._sum.amount || 0),
        platformCommissionCollected: Number(commissionAgg._sum.platformFee || 0),
        gymNetSettled: Number(commissionAgg._sum.gymNetAmount || 0)
      }
    };
  }

  /**
   * Manually override or update a gym's subscription
   */
  static async updateGymSubscription(gymId, { status, planId, currentPeriodEnd, gracePeriodEnd, reason, adminUserId }) {
    const existing = await prisma.gymSubscription.findUnique({ where: { gymId } });
    if (!existing) {
      const error = new Error('Gym subscription not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (planId !== undefined) updateData.planId = planId || null;
    if (currentPeriodEnd) updateData.currentPeriodEnd = new Date(currentPeriodEnd);
    if (gracePeriodEnd) updateData.gracePeriodEnd = new Date(gracePeriodEnd);

    const updated = await prisma.gymSubscription.update({
      where: { gymId },
      data: updateData,
      include: { plan: true }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        userId: adminUserId || null,
        action: 'SUPER_ADMIN_SUBSCRIPTION_OVERRIDE',
        entity: 'GymSubscription',
        entityId: updated.id,
        metadata: {
          previousStatus: existing.status,
          newStatus: updated.status,
          reason: reason || 'Super Admin manual status adjustment',
          adminUserId
        }
      }
    }).catch(() => {});

    return updated;
  }

  /**
   * List all Subscriptions across platform
   */
  static async listSubscriptions({ status = '', search = '', page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.gym = {
        OR: [
          { legalName: { contains: q } },
          { tradeName: { contains: q } },
          { contactEmail: { contains: q } }
        ]
      };
    }

    const [subscriptions, total] = await Promise.all([
      prisma.gymSubscription.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: true,
          gym: {
            select: {
              id: true,
              legalName: true,
              tradeName: true,
              contactEmail: true,
              phone: true,
              paymentMode: true
            }
          },
          invoices: {
            take: 1,
            orderBy: { createdAt: 'desc' }
          }
        }
      }),
      prisma.gymSubscription.count({ where })
    ]);

    return {
      subscriptions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * List all SaaS Subscription Plans
   */
  static async listSubscriptionPlans() {
    return await prisma.gymSubscriptionPlan.findMany({
      orderBy: { monthlyPrice: 'asc' },
      include: {
        _count: {
          select: { subscriptions: true }
        }
      }
    });
  }

  /**
   * Create a new SaaS Subscription Plan
   */
  static async createSubscriptionPlan({
    name,
    description,
    monthlyPrice,
    yearlyPrice,
    currency = 'USD',
    trialDays = 14,
    gracePeriodDays = 7,
    featureList = [],
    isActive = true
  }) {
    if (!name || monthlyPrice === undefined) {
      const error = new Error('Plan name and monthly price are required');
      error.statusCode = 400;
      throw error;
    }

    const plan = await prisma.gymSubscriptionPlan.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        monthlyPrice: Number(monthlyPrice),
        yearlyPrice: yearlyPrice ? Number(yearlyPrice) : null,
        currency: (currency || 'USD').toUpperCase(),
        trialDays: Math.max(0, Number(trialDays) || 0),
        gracePeriodDays: Math.max(0, Number(gracePeriodDays) || 0),
        featureList: Array.isArray(featureList) ? featureList : [],
        isActive: Boolean(isActive)
      }
    });

    return plan;
  }

  /**
   * Update a SaaS Subscription Plan
   */
  static async updateSubscriptionPlan(planId, data) {
    const existing = await prisma.gymSubscriptionPlan.findUnique({ where: { id: planId } });
    if (!existing) {
      const error = new Error('Plan not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.monthlyPrice !== undefined) updateData.monthlyPrice = Number(data.monthlyPrice);
    if (data.yearlyPrice !== undefined) updateData.yearlyPrice = data.yearlyPrice ? Number(data.yearlyPrice) : null;
    if (data.currency !== undefined) updateData.currency = data.currency.toUpperCase();
    if (data.trialDays !== undefined) updateData.trialDays = Number(data.trialDays);
    if (data.gracePeriodDays !== undefined) updateData.gracePeriodDays = Number(data.gracePeriodDays);
    if (data.featureList !== undefined) updateData.featureList = data.featureList;
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

    const updated = await prisma.gymSubscriptionPlan.update({
      where: { id: planId },
      data: updateData
    });

    return updated;
  }

  /**
   * Delete or deactivate SaaS Plan
   */
  static async deleteSubscriptionPlan(planId) {
    const count = await prisma.gymSubscription.count({ where: { planId } });
    if (count > 0) {
      // Soft-deactivate if in use
      return await prisma.gymSubscriptionPlan.update({
        where: { id: planId },
        data: { isActive: false }
      });
    }

    return await prisma.gymSubscriptionPlan.delete({ where: { id: planId } });
  }

  /**
   * List platform-wide transactions (student payments & subscription invoices)
   */
  static async listPlatformPayments({ search = '', status = '', type = 'ALL', page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status.toUpperCase();
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { providerPaymentId: { contains: q } },
        { member: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }] } },
        { gym: { OR: [{ legalName: { contains: q } }, { tradeName: { contains: q } }] } }
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { transactionDate: 'desc' },
        include: {
          gym: { select: { id: true, legalName: true, tradeName: true } },
          member: { select: { id: true, firstName: true, lastName: true, email: true } },
          commissionTransactions: true
        }
      }),
      prisma.payment.count({ where })
    ]);

    return {
      payments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * List platform commissions
   */
  static async listPlatformCommissions({ gymId = '', status = '', page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const where = {};
    if (gymId) where.gymId = gymId;
    if (status && status !== 'ALL') where.status = status.toUpperCase();

    const [commissions, total] = await Promise.all([
      prisma.commissionTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          gym: { select: { id: true, legalName: true, tradeName: true } },
          payment: { select: { id: true, amount: true, status: true, providerPaymentId: true } }
        }
      }),
      prisma.commissionTransaction.count({ where })
    ]);

    return {
      commissions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * List platform payouts
   */
  static async listPlatformPayouts({ gymId = '', status = '', page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const where = {};
    if (gymId) where.gymId = gymId;
    if (status && status !== 'ALL') where.status = status.toUpperCase();

    const [payouts, total] = await Promise.all([
      prisma.payoutRecord.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          gym: { select: { id: true, legalName: true, tradeName: true } }
        }
      }),
      prisma.payoutRecord.count({ where })
    ]);

    return {
      payouts,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * Get Platform Settings and Super Admin profile
   */
  static async getPlatformSettings(adminUserId) {
    const adminUser = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });

    const [totalGyms, totalUsers, totalPlans, totalInvoices] = await Promise.all([
      prisma.gym.count(),
      prisma.user.count(),
      prisma.gymSubscriptionPlan.count(),
      prisma.gymSubscriptionInvoice.count()
    ]);

    return {
      adminUser,
      platform: {
        platformName: 'IronPulse Platform OS',
        supportEmail: 'support@ironpulse.club',
        defaultCurrency: 'USD',
        defaultTrialDays: 14,
        defaultGracePeriodDays: 7,
        defaultCommissionRate: 2.50,
        fixedCommissionFee: 0.30,
        systemVersion: 'v2.6.4 (Production)',
        environment: process.env.NODE_ENV || 'development',
        dbStatus: 'CONNECTED'
      },
      stats: {
        totalGyms,
        totalUsers,
        totalPlans,
        totalInvoices
      }
    };
  }

  /**
   * Update Super Admin profile & security settings
   */
  static async updatePlatformSettings(adminUserId, { name, email, currentPassword, newPassword }) {
    const user = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!user) {
      const error = new Error('Admin user not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email: email.trim(), NOT: { id: adminUserId } }
      });
      if (existing) {
        const error = new Error('Email is already in use by another account');
        error.statusCode = 400;
        throw error;
      }
      updateData.email = email.trim();
    }

    if (newPassword) {
      const { default: bcrypt } = await import('bcryptjs');
      if (!currentPassword) {
        const error = new Error('Current password is required to set a new password');
        error.statusCode = 400;
        throw error;
      }
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        const error = new Error('Current password is incorrect');
        error.statusCode = 400;
        throw error;
      }
      if (newPassword.length < 6) {
        const error = new Error('New password must be at least 6 characters long');
        error.statusCode = 400;
        throw error;
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: adminUserId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, updatedAt: true }
    });

    return updated;
  }
}

export default SuperAdminService;

