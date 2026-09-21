import prisma from '../prisma.js';

class PaymentMethodService {
  /**
   * List payment methods with pagination and filtering
   */
  async getPaymentMethods({
    gymId,
    page = 1,
    limit = 20,
    memberId,
    type,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const skip = (page - 1) * limit;

    const where = {
      gymId
    };

    if (memberId) {
      where.memberId = memberId;
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    const [paymentMethods, total] = await Promise.all([
      prisma.paymentMethod.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder
        },
        select: {
          id: true,
          gymId: true,
          memberId: true,
          provider: true,
          providerPaymentMethodId: true,
          type: true,
          brand: true,
          last4: true,
          expMonth: true,
          expYear: true,
          isDefault: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          member: {
            select: {
              id: true,
              memberId: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      }),
      prisma.paymentMethod.count({ where })
    ]);

    return {
      paymentMethods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single payment method by ID (tenant-scoped)
   */
  async getPaymentMethodById({ gymId, paymentMethodId }) {
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        gymId
      },
      select: {
        id: true,
        gymId: true,
        memberId: true,
        provider: true,
        providerPaymentMethodId: true,
        type: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        isDefault: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!paymentMethod) {
      const error = new Error('Payment method not found');
      error.statusCode = 404;
      throw error;
    }

    return paymentMethod;
  }

  /**
   * Create safe tokenized payment method
   */
  async createPaymentMethod({ gymId, data }) {
    // 1. Verify member exists and belongs to this gym
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

    // 2. If isDefault is true, unset other default payment methods for this member atomically
    if (data.isDefault) {
      return await prisma.$transaction(async (tx) => {
        await tx.paymentMethod.updateMany({
          where: {
            memberId: data.memberId,
            gymId,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        });

        return await tx.paymentMethod.create({
          data: {
            gymId,
            memberId: data.memberId,
            provider: data.provider.trim(),
            providerPaymentMethodId: data.providerPaymentMethodId ? data.providerPaymentMethodId.trim() : null,
            type: data.type,
            brand: data.brand ? data.brand.trim() : null,
            last4: data.last4 ? String(data.last4).trim() : null,
            expMonth: data.expMonth ? parseInt(data.expMonth, 10) : null,
            expYear: data.expYear ? parseInt(data.expYear, 10) : null,
            isDefault: true,
            status: data.status || 'ACTIVE'
          },
          select: {
            id: true,
            gymId: true,
            memberId: true,
            provider: true,
            providerPaymentMethodId: true,
            type: true,
            brand: true,
            last4: true,
            expMonth: true,
            expYear: true,
            isDefault: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        });
      });
    }

    return await prisma.paymentMethod.create({
      data: {
        gymId,
        memberId: data.memberId,
        provider: data.provider.trim(),
        providerPaymentMethodId: data.providerPaymentMethodId ? data.providerPaymentMethodId.trim() : null,
        type: data.type,
        brand: data.brand ? data.brand.trim() : null,
        last4: data.last4 ? String(data.last4).trim() : null,
        expMonth: data.expMonth ? parseInt(data.expMonth, 10) : null,
        expYear: data.expYear ? parseInt(data.expYear, 10) : null,
        isDefault: Boolean(data.isDefault),
        status: data.status || 'ACTIVE'
      },
      select: {
        id: true,
        gymId: true,
        memberId: true,
        provider: true,
        providerPaymentMethodId: true,
        type: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        isDefault: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  /**
   * Update safe fields on payment method
   */
  async updatePaymentMethod({ gymId, paymentMethodId, data }) {
    const existing = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Payment method not found');
      error.statusCode = 404;
      throw error;
    }

    const updatePayload = {};

    if (data.brand !== undefined) updatePayload.brand = data.brand ? data.brand.trim() : null;
    if (data.last4 !== undefined) updatePayload.last4 = data.last4 ? String(data.last4).trim() : null;
    if (data.expMonth !== undefined) updatePayload.expMonth = data.expMonth ? parseInt(data.expMonth, 10) : null;
    if (data.expYear !== undefined) updatePayload.expYear = data.expYear ? parseInt(data.expYear, 10) : null;
    if (data.providerPaymentMethodId !== undefined) {
      updatePayload.providerPaymentMethodId = data.providerPaymentMethodId ? data.providerPaymentMethodId.trim() : null;
    }

    if (data.isDefault === true) {
      return await prisma.$transaction(async (tx) => {
        await tx.paymentMethod.updateMany({
          where: {
            memberId: existing.memberId,
            gymId,
            isDefault: true,
            id: { not: paymentMethodId }
          },
          data: {
            isDefault: false
          }
        });

        updatePayload.isDefault = true;

        return await tx.paymentMethod.update({
          where: { id: paymentMethodId },
          data: updatePayload
        });
      });
    }

    if (data.isDefault !== undefined) {
      updatePayload.isDefault = data.isDefault;
    }

    return await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: updatePayload
    });
  }

  /**
   * Update payment method status
   */
  async updatePaymentMethodStatus({ gymId, paymentMethodId, status }) {
    const existing = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Payment method not found');
      error.statusCode = 404;
      throw error;
    }

    return await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { status }
    });
  }

  /**
   * Safe delete payment method (block if historical payments exist)
   */
  async deletePaymentMethod({ gymId, paymentMethodId }) {
    const existing = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        gymId
      },
      include: {
        _count: {
          select: {
            payments: true
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Payment method not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing._count.payments > 0) {
      const error = new Error(
        'Payment method cannot be deleted because payment transaction history references it. Update status to REVOKED instead.'
      );
      error.statusCode = 409;
      throw error;
    }

    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId }
    });

    return { message: 'Payment method deleted successfully' };
  }
}

export default new PaymentMethodService();
