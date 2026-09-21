import prisma from '../prisma.js';

export class MembershipPlanService {
  /**
   * List membership plans with pagination, filtering, search, and sorting
   * @param {Object} params - { gymId, page, limit, search, isActive, sortBy, sortOrder }
   */
  static async getPlans({ gymId, page = 1, limit = 20, search, isActive, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const where = { gymId };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const total = await prisma.membershipPlan.count({ where });

    const plans = await prisma.membershipPlan.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder
      },
      include: {
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    return {
      plans,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    };
  }

  /**
   * Get membership plan details by ID
   * @param {Object} params - { gymId, planId }
   */
  static async getPlanById({ gymId, planId }) {
    const plan = await prisma.membershipPlan.findFirst({
      where: {
        id: planId,
        gymId
      },
      include: {
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    if (!plan) {
      const error = new Error('Membership plan not found');
      error.statusCode = 404;
      throw error;
    }

    return plan;
  }

  /**
   * Create a new membership plan
   * @param {Object} params - { gymId, data }
   */
  static async createPlan({ gymId, data }) {
    const trimmedName = data.name.trim();

    // Check duplicate name within the same gym
    const duplicate = await prisma.membershipPlan.findFirst({
      where: {
        gymId,
        name: trimmedName
      },
      select: { id: true }
    });

    if (duplicate) {
      const error = new Error('A membership plan with this name already exists');
      error.statusCode = 409;
      throw error;
    }

    const created = await prisma.membershipPlan.create({
      data: {
        gymId,
        name: trimmedName,
        description: data.description ? data.description.trim() : null,
        price: data.price,
        billingFrequency: data.billingFrequency || 'MONTHLY',
        featureList: data.featureList || null,
        isActive: data.isActive !== undefined ? data.isActive : true
      },
      include: {
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    return created;
  }

  /**
   * Update membership plan
   * @param {Object} params - { gymId, planId, data }
   */
  static async updatePlan({ gymId, planId, data }) {
    const existing = await prisma.membershipPlan.findFirst({
      where: {
        id: planId,
        gymId
      },
      select: { id: true, name: true }
    });

    if (!existing) {
      const error = new Error('Membership plan not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (trimmedName !== existing.name) {
        const duplicate = await prisma.membershipPlan.findFirst({
          where: {
            gymId,
            name: trimmedName,
            id: { not: planId }
          },
          select: { id: true }
        });

        if (duplicate) {
          const error = new Error('A membership plan with this name already exists');
          error.statusCode = 409;
          throw error;
        }

        updateData.name = trimmedName;
      }
    }

    if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.billingFrequency !== undefined) updateData.billingFrequency = data.billingFrequency;
    if (data.featureList !== undefined) updateData.featureList = data.featureList;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.membershipPlan.update({
      where: { id: planId },
      data: updateData,
      include: {
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    return updated;
  }

  /**
   * Update plan active status
   * @param {Object} params - { gymId, planId, isActive }
   */
  static async updatePlanStatus({ gymId, planId, isActive }) {
    const existing = await prisma.membershipPlan.findFirst({
      where: {
        id: planId,
        gymId
      },
      select: { id: true }
    });

    if (!existing) {
      const error = new Error('Membership plan not found');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.membershipPlan.update({
      where: { id: planId },
      data: { isActive },
      include: {
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    return updated;
  }

  /**
   * Delete membership plan (rejects if active memberships reference it)
   * @param {Object} params - { gymId, planId }
   */
  static async deletePlan({ gymId, planId }) {
    const existing = await prisma.membershipPlan.findFirst({
      where: {
        id: planId,
        gymId
      },
      select: {
        id: true,
        _count: {
          select: {
            memberships: true
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Membership plan not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing._count.memberships > 0) {
      const error = new Error('Plan cannot be deleted because memberships are using this plan.');
      error.statusCode = 409;
      throw error;
    }

    await prisma.membershipPlan.delete({
      where: { id: planId }
    });

    return {
      message: 'Membership plan deleted successfully'
    };
  }
}

export default MembershipPlanService;
