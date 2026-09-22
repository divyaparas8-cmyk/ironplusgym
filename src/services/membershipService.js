import prisma from '../prisma.js';

export class MembershipService {
  /**
   * List memberships with pagination, search, filters, and sorting
   * @param {Object} params - { gymId, page, limit, search, status, planId, memberId, sortBy, sortOrder }
   */
  static async getMemberships({
    gymId,
    page = 1,
    limit = 20,
    search,
    status,
    planId,
    memberId,
    sortBy = 'startDate',
    sortOrder = 'desc'
  }) {
    const where = { gymId };

    if (status) {
      where.status = status;
    }

    if (planId) {
      where.planId = planId;
    }

    if (memberId) {
      where.memberId = memberId;
    }

    if (search) {
      where.OR = [
        { member: { firstName: { contains: search } } },
        { member: { lastName: { contains: search } } },
        { member: { email: { contains: search } } },
        { member: { memberId: { contains: search } } },
        { plan: { name: { contains: search } } }
      ];
    }

    const total = await prisma.membership.count({ where });

    const memberships = await prisma.membership.findMany({
      where,
      skip: (page - 1) * limit,
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
            email: true,
            phone: true,
            status: true
          }
        },
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            billingFrequency: true,
            isActive: true
          }
        }
      }
    });

    return {
      memberships,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    };
  }

  /**
   * Get single membership by ID
   * @param {Object} params - { gymId, membershipId }
   */
  static async getMembershipById({ gymId, membershipId }) {
    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
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
            phone: true,
            avatar: true,
            status: true
          }
        },
        plan: true,
        recurringBilling: true,
        _count: {
          select: {
            payments: true,
            invoices: true
          }
        }
      }
    });

    if (!membership) {
      const error = new Error('Membership not found');
      error.statusCode = 404;
      throw error;
    }

    return membership;
  }

  /**
   * Create a new membership for a member
   * @param {Object} params - { gymId, data }
   */
  static async createMembership({ gymId, data }) {
    // 1. Verify Member belongs to the authenticated gym
    const member = await prisma.member.findFirst({
      where: {
        id: data.memberId,
        gymId
      },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!member) {
      const error = new Error('Member not found in the current gym');
      error.statusCode = 404;
      throw error;
    }

    // 2. Verify Plan belongs to the authenticated gym
    const plan = await prisma.membershipPlan.findFirst({
      where: {
        id: data.planId,
        gymId
      }
    });

    if (!plan) {
      const error = new Error('Membership plan not found in the current gym');
      error.statusCode = 404;
      throw error;
    }

    const price = data.price !== undefined ? data.price : plan.price;
    const billingFrequency = data.billingFrequency || plan.billingFrequency;
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const nextBillingDate = data.nextBillingDate ? new Date(data.nextBillingDate) : null;
    const status = data.status || 'ACTIVE';

    const created = await prisma.membership.create({
      data: {
        gymId,
        memberId: member.id,
        planId: plan.id,
        status,
        price,
        billingFrequency,
        startDate,
        endDate,
        nextBillingDate
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
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            billingFrequency: true
          }
        }
      }
    });

    return created;
  }

  /**
   * Update membership fields
   * @param {Object} params - { gymId, membershipId, data }
   */
  static async updateMembership({ gymId, membershipId, data }) {
    const existing = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Membership not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};

    // Validate new plan if provided
    if (data.planId !== undefined && data.planId !== existing.planId) {
      const plan = await prisma.membershipPlan.findFirst({
        where: {
          id: data.planId,
          gymId
        }
      });

      if (!plan) {
        const error = new Error('Membership plan not found in the current gym');
        error.statusCode = 404;
        throw error;
      }
      updateData.planId = plan.id;
    }

    if (data.status !== undefined) updateData.status = data.status;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.billingFrequency !== undefined) updateData.billingFrequency = data.billingFrequency;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.nextBillingDate !== undefined) updateData.nextBillingDate = data.nextBillingDate ? new Date(data.nextBillingDate) : null;

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: updateData,
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
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            billingFrequency: true
          }
        }
      }
    });

    return updated;
  }

  /**
   * Update membership status
   * @param {Object} params - { gymId, membershipId, status }
   */
  static async updateMembershipStatus({ gymId, membershipId, status }) {
    const existing = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Membership not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = { status };

    if (status === 'PAUSED') {
      updateData.pausedAt = new Date();
    } else if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date();
    } else if (status === 'ACTIVE') {
      updateData.pausedAt = null;
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: updateData,
      include: {
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true
          }
        },
        plan: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return updated;
  }

  /**
   * Delete membership (rejects if payments/invoices exist)
   * @param {Object} params - { gymId, membershipId }
   */
  static async deleteMembership({ gymId, membershipId }) {
    const existing = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        gymId
      },
      include: {
        _count: {
          select: {
            payments: true,
            invoices: true
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Membership not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing._count.payments > 0 || existing._count.invoices > 0) {
      const error = new Error('Cannot permanently delete membership with existing payment or invoice history. Please cancel or change status to CANCELLED instead.');
      error.statusCode = 409;
      throw error;
    }

    await prisma.membership.delete({
      where: { id: membershipId }
    });

    return {
      message: 'Membership deleted successfully'
    };
  }

  /**
   * Automatically detect and transition expired memberships to EXPIRED status
   * Also cancels any active recurring billing schedule and logs audit trail.
   */
  static async processExpiredMemberships(gymId = null) {
    const now = new Date();
    const where = {
      status: 'ACTIVE',
      endDate: {
        lt: now
      }
    };
    if (gymId) {
      where.gymId = gymId;
    }

    const expiredList = await prisma.membership.findMany({
      where,
      include: {
        member: true,
        recurringBilling: true
      }
    });

    const results = [];
    for (const membership of expiredList) {
      // 1. Update membership status
      await prisma.membership.update({
        where: { id: membership.id },
        data: { status: 'EXPIRED' }
      });

      // 2. Cancel associated active recurring billing
      if (membership.recurringBilling && membership.recurringBilling.status === 'ACTIVE') {
        await prisma.recurringBilling.update({
          where: { id: membership.recurringBilling.id },
          data: { status: 'CANCELLED' }
        });
      }

      // 3. Check if member has other active memberships; if none, update member status to EXPIRED
      const otherActive = await prisma.membership.count({
        where: {
          memberId: membership.memberId,
          status: 'ACTIVE',
          id: { not: membership.id }
        }
      });

      if (otherActive === 0) {
        await prisma.member.update({
          where: { id: membership.memberId },
          data: { status: 'EXPIRED' }
        });
      }

      results.push({
        membershipId: membership.id,
        memberId: membership.memberId,
        memberName: `${membership.member.firstName} ${membership.member.lastName}`
      });
    }

    return {
      processedCount: results.length,
      expiredMemberships: results
    };
  }
}

export default MembershipService;
