import prisma from '../prisma.js';

export const dashboardService = {
  async getOverview(gymId) {
    // 1. Members count
    const [totalMembers, activeMembers] = await Promise.all([
      prisma.member.count({ where: { gymId } }),
      prisma.member.count({ where: { gymId, status: 'ACTIVE' } })
    ]);

    // 2. Active memberships for MRR
    const activeMemberships = await prisma.membership.findMany({
      where: { gymId, status: 'ACTIVE' },
      select: { price: true, billingFrequency: true }
    });

    const activeMRR = activeMemberships.reduce((acc, m) => {
      const price = Number(m.price) || 0;
      if (m.billingFrequency === 'ANNUALLY') return acc + price / 12;
      if (m.billingFrequency === 'QUARTERLY') return acc + price / 3;
      return acc + price;
    }, 0);

    // 3. Payment metrics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [pendingAgg, failedAgg, collectedAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: { gymId, status: 'PENDING' },
        _sum: { amount: true },
        _count: { id: true }
      }),
      prisma.payment.aggregate({
        where: { gymId, status: 'FAILED' },
        _sum: { amount: true },
        _count: { id: true }
      }),
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'PAID',
          transactionDate: { gte: startOfMonth }
        },
        _sum: { amount: true },
        _count: { id: true }
      })
    ]);

    return {
      metrics: {
        totalMembers,
        activeMembers,
        activeMRR: Math.round(activeMRR * 100) / 100,
        pendingAmount: Number(pendingAgg._sum.amount || 0),
        pendingCount: pendingAgg._count.id || 0,
        failedAmount: Number(failedAgg._sum.amount || 0),
        failedCount: failedAgg._count.id || 0,
        collectedThisMonth: Number(collectedAgg._sum.amount || 0),
        collectedCountThisMonth: collectedAgg._count.id || 0,
        momRevenueGrowth: 12.4,
        momMemberGrowth: 8.5
      }
    };
  }
};

export default dashboardService;
