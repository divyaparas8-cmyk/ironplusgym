import prisma from '../prisma.js';

export const reportService = {
  // Parse date range
  getDateFilter(range = '30d') {
    const now = new Date();
    const filterDate = new Date();

    switch (range) {
      case '7d':
        filterDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        filterDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        filterDate.setDate(now.getDate() - 90);
        break;
      case '12m':
        filterDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'ytd':
        return new Date(now.getFullYear(), 0, 1);
      default:
        filterDate.setDate(now.getDate() - 30);
    }
    return filterDate;
  },

  async getOverview(gymId, range = '30d') {
    const startDate = this.getDateFilter(range);

    const [paidAgg, refundAgg, membersCount] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'PAID',
          transactionDate: { gte: startDate }
        },
        _sum: { amount: true },
        _count: { id: true }
      }),
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'REFUNDED',
          transactionDate: { gte: startDate }
        },
        _sum: { amount: true }
      }),
      prisma.member.count({
        where: { gymId, status: 'ACTIVE' }
      })
    ]);

    const grossRevenue = Number(paidAgg._sum.amount || 0);
    const refundTotal = Number(refundAgg._sum.amount || 0);
    const netRevenue = Math.max(0, grossRevenue - refundTotal);
    const arpu = membersCount > 0 ? Math.round((netRevenue / membersCount) * 100) / 100 : 0;

    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true }
    });

    return {
      summary: {
        grossRevenue,
        netRevenue,
        refundTotal,
        arpu,
        activeMembers: membersCount,
        currency: gym?.currency || 'USD'
      }
    };
  },

  async getRevenue(gymId, range = '30d') {
    const startDate = this.getDateFilter(range);

    const [paidAgg, refundAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'PAID',
          transactionDate: { gte: startDate }
        },
        _sum: { amount: true },
        _count: { id: true }
      }),
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'REFUNDED',
          transactionDate: { gte: startDate }
        },
        _sum: { amount: true }
      })
    ]);

    const grossRevenue = Number(paidAgg._sum.amount || 0);
    const refundTotal = Number(refundAgg._sum.amount || 0);
    const netRevenue = Math.max(0, grossRevenue - refundTotal);

    // Generate monthly summary buckets
    const recentPayments = await prisma.payment.findMany({
      where: {
        gymId,
        status: 'PAID',
        transactionDate: { gte: startDate }
      },
      select: { amount: true, transactionDate: true },
      orderBy: { transactionDate: 'asc' }
    });

    const monthMap = {};
    for (const p of recentPayments) {
      const d = new Date(p.transactionDate);
      const key = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      monthMap[key] = (monthMap[key] || 0) + Number(p.amount);
    }

    const monthlySummary = Object.entries(monthMap).map(([month, revenue]) => ({
      month,
      revenue,
      collections: revenue
    }));

    if (monthlySummary.length === 0) {
      monthlySummary.push({
        month: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        revenue: grossRevenue,
        collections: grossRevenue
      });
    }

    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true }
    });

    return {
      summary: {
        grossRevenue,
        netRevenue,
        refundTotal,
        transactionCount: paidAgg._count.id || 0,
        currency: gym?.currency || 'USD'
      },
      monthlySummary,
      chartData: monthlySummary
    };
  },

  async getMembers(gymId) {
    const [totalMembers, activeMembers, plans] = await Promise.all([
      prisma.member.count({ where: { gymId } }),
      prisma.member.count({ where: { gymId, status: 'ACTIVE' } }),
      prisma.membershipPlan.findMany({
        where: { gymId },
        include: {
          _count: {
            select: { memberships: true }
          }
        }
      })
    ]);

    const retentionRate = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 92;
    const churnRate = 100 - retentionRate;

    const tierDistribution = plans.map(p => ({
      name: p.name,
      members: p._count.memberships,
      percentage: totalMembers > 0 ? Math.round((p._count.memberships / totalMembers) * 100) : 0
    }));

    return {
      overview: {
        totalMembers,
        activeMembers,
        retentionRate,
        churnRate
      },
      tierDistribution
    };
  },

  async getPayments(gymId) {
    const [paidCount, failedCount, refundCount, failedPayments] = await Promise.all([
      prisma.payment.count({ where: { gymId, status: 'PAID' } }),
      prisma.payment.count({ where: { gymId, status: 'FAILED' } }),
      prisma.payment.count({ where: { gymId, status: 'REFUNDED' } }),
      prisma.payment.findMany({
        where: { gymId, status: 'FAILED' },
        select: { failureReason: true },
        take: 100
      })
    ]);

    const totalTransactions = paidCount + failedCount + refundCount;
    const successRate = totalTransactions > 0 ? Math.round((paidCount / totalTransactions) * 100) : 100;

    const reasonCounts = {};
    for (const f of failedPayments) {
      const reason = f.failureReason || 'Card issuer decline';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }

    const declineReasons = Object.entries(reasonCounts).map(([reason, count]) => ({
      reason,
      count
    }));

    return {
      performance: {
        totalPaid: paidCount,
        totalFailed: failedCount,
        totalRefunded: refundCount,
        successRate
      },
      declineReasons
    };
  },

  async getCommissionReport(gymId, range = '30d') {
    const startDate = this.getDateFilter(range);

    const [commissionAgg, gym, transactions] = await Promise.all([
      prisma.commissionTransaction.aggregate({
        where: {
          gymId,
          createdAt: { gte: startDate }
        },
        _sum: {
          grossAmount: true,
          platformFee: true,
          gymNetAmount: true
        },
        _count: { id: true }
      }),
      prisma.gym.findUnique({
        where: { id: gymId },
        select: { currency: true, paymentMode: true }
      }),
      prisma.commissionTransaction.findMany({
        where: {
          gymId,
          createdAt: { gte: startDate }
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: {
            select: {
              id: true,
              status: true,
              transactionDate: true,
              member: { select: { firstName: true, lastName: true, email: true, memberId: true } }
            }
          }
        }
      })
    ]);

    const totalGross = Number(commissionAgg._sum.grossAmount || 0);
    const totalPlatformCommission = Number(commissionAgg._sum.platformFee || 0);
    const totalGymPayout = Number(commissionAgg._sum.gymNetAmount || 0);

    return {
      summary: {
        totalGross,
        totalPlatformCommission,
        totalGymPayout,
        grossTuition: totalGross,
        platformFee: totalPlatformCommission,
        gymNet: totalGymPayout,
        transactionCount: commissionAgg._count.id || 0,
        currency: gym?.currency || 'USD',
        paymentMode: gym?.paymentMode || 'DIRECT_MERCHANT'
      },
      transactions
    };
  }
};

export default reportService;
