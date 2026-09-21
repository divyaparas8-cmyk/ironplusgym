import prisma from '../prisma.js';
import { ALLOWED_SUBSCRIPTION_STATUS_TRANSITIONS } from '../validators/recurringBillingValidator.js';

/**
 * Calendar-safe next billing date calculation
 */
export const calculateNextBillingDate = (fromDate, billingFrequency = 'MONTHLY') => {
  const date = new Date(fromDate);
  const targetDay = date.getDate();

  if (billingFrequency === 'MONTHLY') {
    date.setMonth(date.getMonth() + 1);
    if (date.getDate() !== targetDay) {
      date.setDate(0); // Cap at last day of the target month
    }
  } else if (billingFrequency === 'QUARTERLY') {
    date.setMonth(date.getMonth() + 3);
    if (date.getDate() !== targetDay) {
      date.setDate(0);
    }
  } else if (billingFrequency === 'ANNUALLY') {
    date.setFullYear(date.getFullYear() + 1);
  }

  return date;
};

class RecurringBillingService {
  /**
   * List recurring billing schedules with filters and pagination
   */
  async getRecurringBillings({
    gymId,
    page = 1,
    limit = 20,
    memberId,
    membershipId,
    status,
    billingFrequency,
    sortBy = 'nextBillingDate',
    sortOrder = 'asc'
  }) {
    const skip = (page - 1) * limit;

    const where = {
      gymId
    };

    if (memberId) where.memberId = memberId;
    if (membershipId) where.membershipId = membershipId;
    if (status) where.status = status;
    if (billingFrequency) where.billingFrequency = billingFrequency;

    const [recurringBillings, total] = await Promise.all([
      prisma.recurringBilling.findMany({
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
              email: true,
              paymentMethods: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  type: true,
                  brand: true,
                  last4: true,
                  isDefault: true,
                  status: true
                }
              }
            }
          },
          membership: {
            select: {
              id: true,
              planId: true,
              status: true,
              plan: {
                select: {
                  id: true,
                  name: true,
                  price: true
                }
              }
            }
          }
        }
      }),
      prisma.recurringBilling.count({ where })
    ]);

    return {
      recurringBillings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single recurring billing schedule by ID
   */
  async getRecurringBillingById({ gymId, id }) {
    const recurring = await prisma.recurringBilling.findFirst({
      where: {
        id,
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
            paymentMethods: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                type: true,
                brand: true,
                last4: true,
                isDefault: true,
                status: true
              }
            }
          }
        },
        membership: {
          select: {
            id: true,
            planId: true,
            status: true,
            startDate: true,
            nextBillingDate: true,
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                billingFrequency: true
              }
            },
            invoices: {
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                invoiceNumber: true,
                total: true,
                dueDate: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!recurring) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    return recurring;
  }

  /**
   * Create recurring billing schedule
   */
  async createRecurringBilling({ gymId, data }) {
    // 1. Verify member belongs to this gym
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

    // 2. Verify membership belongs to this gym and member
    const membership = await prisma.membership.findFirst({
      where: {
        id: data.membershipId,
        gymId,
        memberId: data.memberId
      }
    });

    if (!membership) {
      const error = new Error('Membership not found or does not belong to specified member');
      error.statusCode = 404;
      throw error;
    }

    if (membership.status !== 'ACTIVE') {
      const error = new Error(`Cannot configure recurring billing for a membership with status '${membership.status}'`);
      error.statusCode = 400;
      throw error;
    }

    // 3. Verify no existing recurring billing on this membership (membershipId is unique)
    const existingSchedule = await prisma.recurringBilling.findUnique({
      where: {
        membershipId: data.membershipId
      }
    });

    if (existingSchedule) {
      const error = new Error('Recurring billing is already configured for this membership');
      error.statusCode = 409;
      throw error;
    }

    // 4. Validate payment method:
    // If client supplied paymentMethodId, verify it belongs to this member, gym, and is ACTIVE.
    if (data.paymentMethodId) {
      const specifiedPm = await prisma.paymentMethod.findFirst({
        where: {
          id: data.paymentMethodId,
          gymId
        }
      });

      if (!specifiedPm || specifiedPm.memberId !== data.memberId) {
        const error = new Error('Payment method not found or does not belong to member');
        error.statusCode = 404;
        throw error;
      }

      if (specifiedPm.status !== 'ACTIVE') {
        const error = new Error(`Payment method is ${specifiedPm.status.toLowerCase()} and cannot be used for recurring billing`);
        error.statusCode = 409;
        throw error;
      }
    } else {
      // Check that member has at least one active payment method
      const activePm = await prisma.paymentMethod.findFirst({
        where: {
          memberId: data.memberId,
          gymId,
          status: 'ACTIVE'
        }
      });

      if (!activePm) {
        const error = new Error('Member does not have an active payment method on file for recurring billing');
        error.statusCode = 409;
        throw error;
      }
    }

    const created = await prisma.recurringBilling.create({
      data: {
        gymId,
        memberId: data.memberId,
        membershipId: data.membershipId,
        amount: Number(data.amount),
        currency: data.currency ? data.currency.toUpperCase() : 'USD',
        billingFrequency: data.billingFrequency || 'MONTHLY',
        nextBillingDate: new Date(data.nextBillingDate),
        status: data.status || 'ACTIVE'
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
        membership: {
          select: {
            id: true,
            planId: true,
            status: true
          }
        }
      }
    });

    return created;
  }

  /**
   * Update recurring billing schedule
   */
  async updateRecurringBilling({ gymId, id, data }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'CANCELLED') {
      const error = new Error('Cannot modify a cancelled recurring billing schedule');
      error.statusCode = 409;
      throw error;
    }

    const updatePayload = {};
    if (data.amount !== undefined) updatePayload.amount = Number(data.amount);
    if (data.billingFrequency !== undefined) updatePayload.billingFrequency = data.billingFrequency;
    if (data.nextBillingDate !== undefined) updatePayload.nextBillingDate = new Date(data.nextBillingDate);

    return await prisma.recurringBilling.update({
      where: { id },
      data: updatePayload,
      include: {
        member: {
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  /**
   * Update status with state-machine transition validation
   */
  async updateStatus({ gymId, id, status }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    const allowed = ALLOWED_SUBSCRIPTION_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status)) {
      const error = new Error(`Invalid status transition: Cannot change status from '${existing.status}' to '${status}'`);
      error.statusCode = 400;
      throw error;
    }

    return await prisma.recurringBilling.update({
      where: { id },
      data: { status }
    });
  }

  /**
   * Pause recurring billing
   */
  async pauseRecurringBilling({ gymId, id }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'PAUSED') {
      const error = new Error('Recurring billing schedule is already paused');
      error.statusCode = 409;
      throw error;
    }

    if (existing.status !== 'ACTIVE') {
      const error = new Error(`Only active schedules can be paused. Current status is '${existing.status}'`);
      error.statusCode = 409;
      throw error;
    }

    return await prisma.recurringBilling.update({
      where: { id },
      data: { status: 'PAUSED' }
    });
  }

  /**
   * Resume recurring billing
   */
  async resumeRecurringBilling({ gymId, id }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'ACTIVE') {
      const error = new Error('Recurring billing schedule is already active');
      error.statusCode = 409;
      throw error;
    }

    if (existing.status !== 'PAUSED') {
      const error = new Error(`Only paused schedules can be resumed. Current status is '${existing.status}'`);
      error.statusCode = 409;
      throw error;
    }

    // If nextBillingDate has passed while paused, advance it safely
    let nextDate = new Date(existing.nextBillingDate);
    const now = new Date();
    if (nextDate <= now) {
      nextDate = calculateNextBillingDate(now, existing.billingFrequency);
    }

    return await prisma.recurringBilling.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        nextBillingDate: nextDate
      }
    });
  }

  /**
   * Cancel recurring billing
   */
  async cancelRecurringBilling({ gymId, id }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'CANCELLED') {
      const error = new Error('Recurring billing schedule is already cancelled');
      error.statusCode = 409;
      throw error;
    }

    return await prisma.recurringBilling.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });
  }

  /**
   * Delete recurring billing (soft cancellation to preserve financial audit history)
   */
  async deleteRecurringBilling({ gymId, id }) {
    const existing = await prisma.recurringBilling.findFirst({
      where: {
        id,
        gymId
      },
      include: {
        membership: {
          include: {
            _count: {
              select: { invoices: true }
            }
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Recurring billing schedule not found');
      error.statusCode = 404;
      throw error;
    }

    // If invoices exist for this membership, preserve historical schedule and soft-cancel
    if (existing.membership && existing.membership._count.invoices > 0) {
      await prisma.recurringBilling.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });
      return {
        message: 'Recurring billing cancelled successfully (retained for financial audit history)'
      };
    }

    await prisma.recurringBilling.delete({
      where: { id }
    });

    return { message: 'Recurring billing deleted successfully' };
  }

  /**
   * Process due recurring billing schedules for the authenticated gym
   * Performs atomic Prisma transaction: Invoice + Payment (PENDING) + nextBillingDate advance
   */
  async processDueRecurringBilling({ gymId }) {
    const now = new Date();

    // 1. Find all active schedules due on or before now for this gym
    const dueSchedules = await prisma.recurringBilling.findMany({
      where: {
        gymId,
        status: 'ACTIVE',
        nextBillingDate: {
          lte: now
        }
      },
      include: {
        member: {
          include: {
            paymentMethods: {
              where: { status: 'ACTIVE' },
              orderBy: { isDefault: 'desc' }
            }
          }
        },
        membership: true
      }
    });

    const results = {
      totalDue: dueSchedules.length,
      processed: 0,
      skipped: 0,
      errors: []
    };

    const year = now.getFullYear();

    for (const schedule of dueSchedules) {
      try {
        // Resolve active payment method
        const paymentMethod = schedule.member.paymentMethods[0] || null;

        const cycleDate = new Date(schedule.nextBillingDate);
        const startOfDay = new Date(cycleDate.getFullYear(), cycleDate.getMonth(), cycleDate.getDate());
        const endOfDay = new Date(cycleDate.getFullYear(), cycleDate.getMonth(), cycleDate.getDate(), 23, 59, 59, 999);

        // Atomic transaction for coupled financial records and schedule advance
        const outcome = await prisma.$transaction(async (tx) => {
          // Concurrency/Duplicate check: verify no invoice already exists for this cycle
          const existingInvoice = await tx.invoice.findFirst({
            where: {
              gymId,
              memberId: schedule.memberId,
              membershipId: schedule.membershipId,
              dueDate: {
                gte: startOfDay,
                lte: endOfDay
              }
            }
          });

          if (existingInvoice) {
            // Already drafted for this cycle; advance schedule date without duplicate billing
            const nextDate = calculateNextBillingDate(schedule.nextBillingDate, schedule.billingFrequency);
            await tx.recurringBilling.update({
              where: { id: schedule.id },
              data: { nextBillingDate: nextDate }
            });
            return { skipped: true, reason: 'Invoice already exists for this cycle' };
          }

          // Generate unique invoice number
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const invoiceNumber = `INV-${year}-${randomSuffix}-${Date.now().toString().slice(-4)}`;

          // 1. Create Invoice
          const invoice = await tx.invoice.create({
            data: {
              gymId,
              memberId: schedule.memberId,
              membershipId: schedule.membershipId,
              invoiceNumber,
              subtotal: schedule.amount,
              tax: 0.00,
              total: schedule.amount,
              dueDate: schedule.nextBillingDate,
              status: 'OPEN',
              notes: `Automated recurring billing (${schedule.billingFrequency})`
            }
          });

          // 2. Create Payment ledger record as PENDING (no fake external gateway success)
          const payment = await tx.payment.create({
            data: {
              gymId,
              memberId: schedule.memberId,
              membershipId: schedule.membershipId,
              invoiceId: invoice.id,
              paymentMethodId: paymentMethod ? paymentMethod.id : null,
              amount: schedule.amount,
              currency: schedule.currency,
              status: 'PENDING',
              paymentMethodType: paymentMethod ? paymentMethod.type : 'CARD',
              provider: schedule.provider || 'MANUAL',
              transactionDate: now,
              failureReason: paymentMethod ? null : 'No active payment method on file at drafting'
            }
          });

          // 3. Advance nextBillingDate atomically
          const nextDate = calculateNextBillingDate(schedule.nextBillingDate, schedule.billingFrequency);
          await tx.recurringBilling.update({
            where: { id: schedule.id },
            data: {
              nextBillingDate: nextDate,
              lastRetryDate: now
            }
          });

          return { skipped: false, invoiceId: invoice.id, paymentId: payment.id };
        });

        if (outcome.skipped) {
          results.skipped++;
        } else {
          results.processed++;
        }
      } catch (err) {
        results.errors.push({
          scheduleId: schedule.id,
          error: err.message
        });
      }
    }

    return results;
  }
}

export default new RecurringBillingService();
