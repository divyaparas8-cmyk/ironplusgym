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

    // 4. Calculate True Month-over-Month (MoM) Growth
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [prevCollectedAgg, currNewMembers, prevNewMembers] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          gymId,
          status: 'PAID',
          transactionDate: { gte: startOfPrevMonth, lte: endOfPrevMonth }
        },
        _sum: { amount: true }
      }),
      prisma.member.count({
        where: {
          gymId,
          joinDate: { gte: startOfMonth }
        }
      }),
      prisma.member.count({
        where: {
          gymId,
          joinDate: { gte: startOfPrevMonth, lte: endOfPrevMonth }
        }
      })
    ]);

    const currCollected = Number(collectedAgg._sum.amount || 0);
    const prevCollected = Number(prevCollectedAgg._sum.amount || 0);

    let momRevenueGrowth = 0.0;
    if (prevCollected > 0) {
      momRevenueGrowth = Math.round(((currCollected - prevCollected) / prevCollected) * 1000) / 10;
    } else if (currCollected > 0) {
      momRevenueGrowth = 100.0;
    }

    let momMemberGrowth = 0.0;
    if (prevNewMembers > 0) {
      momMemberGrowth = Math.round(((currNewMembers - prevNewMembers) / prevNewMembers) * 1000) / 10;
    } else if (currNewMembers > 0) {
      momMemberGrowth = 100.0;
    }

    return {
      metrics: {
        totalMembers,
        activeMembers,
        activeMRR: Math.round(activeMRR * 100) / 100,
        pendingAmount: Number(pendingAgg._sum.amount || 0),
        pendingCount: pendingAgg._count.id || 0,
        failedAmount: Number(failedAgg._sum.amount || 0),
        failedCount: failedAgg._count.id || 0,
        collectedThisMonth: currCollected,
        collectedCountThisMonth: collectedAgg._count.id || 0,
        momRevenueGrowth,
        momMemberGrowth
      }
    };
  },

  /**
   * Server-Side Time-Series Aggregation for Revenue Chart (No 100-record cap)
   * Supports: '7 Days', '30 Days', '3 Months', '12 Months'
   */
  async getTimeSeriesRevenue(gymId, period = '30 Days') {
    const now = new Date();
    let startDate = new Date();

    if (period === '7 Days') startDate.setDate(now.getDate() - 7);
    else if (period === '30 Days') startDate.setDate(now.getDate() - 30);
    else if (period === '3 Months') startDate.setMonth(now.getMonth() - 3);
    else if (period === '12 Months') startDate.setFullYear(now.getFullYear() - 1);
    else startDate.setDate(now.getDate() - 30);

    const payments = await prisma.payment.findMany({
      where: {
        gymId,
        transactionDate: { gte: startDate }
      },
      select: {
        amount: true,
        status: true,
        transactionDate: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    // Build time buckets
    if (period === '7 Days') {
      const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - i));
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      });
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - i));
        return d.toDateString();
      });

      const collected = new Array(7).fill(0);
      const pending = new Array(7).fill(0);
      const failed = new Array(7).fill(0);

      payments.forEach(p => {
        const idx = dates.indexOf(new Date(p.transactionDate).toDateString());
        if (idx !== -1) {
          const amt = Number(p.amount) || 0;
          if (p.status === 'PAID') collected[idx] += amt;
          else if (p.status === 'PENDING') pending[idx] += amt;
          else if (p.status === 'FAILED') failed[idx] += amt;
        }
      });

      return {
        labels,
        collected: collected.map(Math.round),
        pending: pending.map(Math.round),
        failed: failed.map(Math.round),
        totalCollected: Math.round(collected.reduce((a, b) => a + b, 0)),
        totalPending: Math.round(pending.reduce((a, b) => a + b, 0)),
        totalFailed: Math.round(failed.reduce((a, b) => a + b, 0))
      };
    }

    if (period === '30 Days') {
      const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      const collected = [0, 0, 0, 0];
      const pending = [0, 0, 0, 0];
      const failed = [0, 0, 0, 0];

      payments.forEach(p => {
        const diffDays = Math.floor((now - new Date(p.transactionDate)) / (1000 * 60 * 60 * 24));
        const idx = diffDays <= 7 ? 3 : diffDays <= 14 ? 2 : diffDays <= 21 ? 1 : 0;
        const amt = Number(p.amount) || 0;
        if (p.status === 'PAID') collected[idx] += amt;
        else if (p.status === 'PENDING') pending[idx] += amt;
        else if (p.status === 'FAILED') failed[idx] += amt;
      });

      return {
        labels,
        collected: collected.map(Math.round),
        pending: pending.map(Math.round),
        failed: failed.map(Math.round),
        totalCollected: Math.round(collected.reduce((a, b) => a + b, 0)),
        totalPending: Math.round(pending.reduce((a, b) => a + b, 0)),
        totalFailed: Math.round(failed.reduce((a, b) => a + b, 0))
      };
    }

    if (period === '3 Months') {
      const labels = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(now);
        d.setMonth(now.getMonth() - (2 - i));
        return d.toLocaleDateString('en-US', { month: 'long' });
      });

      const collected = [0, 0, 0];
      const pending = [0, 0, 0];
      const failed = [0, 0, 0];

      payments.forEach(p => {
        const m = new Date(p.transactionDate).toLocaleDateString('en-US', { month: 'long' });
        const idx = labels.indexOf(m);
        if (idx !== -1) {
          const amt = Number(p.amount) || 0;
          if (p.status === 'PAID') collected[idx] += amt;
          else if (p.status === 'PENDING') pending[idx] += amt;
          else if (p.status === 'FAILED') failed[idx] += amt;
        }
      });

      return {
        labels,
        collected: collected.map(Math.round),
        pending: pending.map(Math.round),
        failed: failed.map(Math.round),
        totalCollected: Math.round(collected.reduce((a, b) => a + b, 0)),
        totalPending: Math.round(pending.reduce((a, b) => a + b, 0)),
        totalFailed: Math.round(failed.reduce((a, b) => a + b, 0))
      };
    }

    // 12 Months
    const labels = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(now.getMonth() - (11 - i));
      return d.toLocaleDateString('en-US', { month: 'short' });
    });

    const collected = new Array(12).fill(0);
    const pending = new Array(12).fill(0);
    const failed = new Array(12).fill(0);

    payments.forEach(p => {
      const m = new Date(p.transactionDate).toLocaleDateString('en-US', { month: 'short' });
      const idx = labels.indexOf(m);
      if (idx !== -1) {
        const amt = Number(p.amount) || 0;
        if (p.status === 'PAID') collected[idx] += amt;
        else if (p.status === 'PENDING') pending[idx] += amt;
        else if (p.status === 'FAILED') failed[idx] += amt;
      }
    });

    return {
      labels,
      collected: collected.map(Math.round),
      pending: pending.map(Math.round),
      failed: failed.map(Math.round),
      totalCollected: Math.round(collected.reduce((a, b) => a + b, 0)),
      totalPending: Math.round(pending.reduce((a, b) => a + b, 0)),
      totalFailed: Math.round(failed.reduce((a, b) => a + b, 0))
    };
  }
};

export default dashboardService;
