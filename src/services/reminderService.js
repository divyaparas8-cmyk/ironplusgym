import prisma from '../prisma.js';
import NotificationDispatcher from './notificationDispatcher.js';
import NotificationTemplateService from './notificationTemplateService.js';

export class ReminderService {
  /**
   * List reminders with filters and pagination
   */
  static async getReminders({
    gymId,
    page = 1,
    limit = 20,
    memberId,
    type,
    status,
    channel,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const skip = (page - 1) * limit;
    const where = { gymId };

    if (memberId) where.memberId = memberId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (channel) where.channel = channel;

    const [reminders, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
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
              total: true,
              dueDate: true,
              status: true
            }
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentMethodType: true
            }
          }
        }
      }),
      prisma.reminder.count({ where })
    ]);

    return {
      reminders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    };
  }

  /**
   * Get single reminder by ID
   */
  static async getReminderById({ gymId, reminderId }) {
    const reminder = await prisma.reminder.findFirst({
      where: {
        id: reminderId,
        gymId
      },
      include: {
        member: true,
        invoice: true,
        payment: true
      }
    });

    if (!reminder) {
      const error = new Error('Reminder not found');
      error.statusCode = 404;
      throw error;
    }

    return reminder;
  }

  /**
   * Create and prepare/dispatch a reminder
   */
  static async createReminder({
    gymId,
    userId,
    memberId,
    invoiceId,
    paymentId,
    membershipId,
    type,
    channel = 'EMAIL',
    message,
    trigger = 'MANUAL_DISPATCH'
  }) {
    // 1. Verify member belongs to tenant gym
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId },
      include: {
        gym: { select: { tradeName: true, legalName: true, currency: true } }
      }
    });

    if (!member) {
      const error = new Error('Member not found or does not belong to this gym');
      error.statusCode = 404;
      throw error;
    }

    // 2. Verify optional relations if provided
    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, gymId, memberId }
      });
      if (!invoice) {
        const error = new Error('Referenced invoice not found for this member');
        error.statusCode = 404;
        throw error;
      }
    }

    let payment = null;
    if (paymentId) {
      payment = await prisma.payment.findFirst({
        where: { id: paymentId, gymId, memberId }
      });
      if (!payment) {
        const error = new Error('Referenced payment not found for this member');
        error.statusCode = 404;
        throw error;
      }
    }

    let membership = null;
    if (membershipId) {
      membership = await prisma.membership.findFirst({
        where: { id: membershipId, gymId, memberId },
        include: { plan: true }
      });
      if (!membership) {
        const error = new Error('Referenced membership not found for this member');
        error.statusCode = 404;
        throw error;
      }
    }

    // 3. Duplicate protection: Check for existing identical reminder within 24h window
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const duplicateWhere = {
      gymId,
      memberId,
      type,
      channel,
      createdAt: { gte: oneDayAgo }
    };

    if (invoiceId) duplicateWhere.invoiceId = invoiceId;
    if (paymentId) duplicateWhere.paymentId = paymentId;

    const existingRecent = await prisma.reminder.findFirst({
      where: duplicateWhere
    });

    if (existingRecent) {
      // Return existing reminder to prevent duplicate messaging
      return {
        ...existingRecent,
        isDuplicateSuppressed: true,
        messageNotice: 'A matching reminder was already dispatched in the last 24 hours.'
      };
    }

    // 4. Resolve message template if not supplied
    const gymName = member.gym.tradeName || member.gym.legalName || 'IronPulse Gym';
    const currency = member.gym.currency || 'USD';
    const amount = invoice ? invoice.total : (payment ? payment.amount : (membership ? membership.price : '89.00'));
    const dueDate = invoice ? new Date(invoice.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const context = {
      memberName: `${member.firstName} ${member.lastName}`,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone || '',
      gymName,
      currency,
      amount: String(amount),
      dueDate,
      invoiceNumber: invoice ? invoice.invoiceNumber : 'INV-GEN',
      planName: membership?.plan?.name || 'Standard Membership',
      membershipEndDate: membership?.endDate ? new Date(membership.endDate).toISOString().split('T')[0] : 'N/A'
    };

    let finalSubject = null;
    let finalMessage = message;

    if (!finalMessage) {
      const template = await NotificationTemplateService.resolveTemplate({ gymId, type, channel });
      finalSubject = template.subject;
      finalMessage = template.body;
    }

    // 5. Evaluate gateway dispatch via NotificationDispatcher
    const dispatchResult = await NotificationDispatcher.dispatch({
      gymId,
      channel,
      recipient: channel === 'EMAIL' ? member.email : member.phone,
      subject: finalSubject,
      message: finalMessage,
      context
    });

    // 6. Record Reminder in database atomically with audit log
    const reminder = await prisma.$transaction(async (tx) => {
      const created = await tx.reminder.create({
        data: {
          gymId,
          memberId,
          paymentId: paymentId || null,
          invoiceId: invoiceId || null,
          membershipId: membershipId || null,
          type,
          channel,
          message: dispatchResult.message || finalMessage,
          status: dispatchResult.status,
          sentAt: dispatchResult.sentAt || null,
          failureReason: dispatchResult.failureReason || null,
          trigger
        },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, email: true }
          },
          invoice: true,
          payment: true
        }
      });

      await tx.auditLog.create({
        data: {
          gymId,
          userId: userId || null,
          action: 'REMINDER_CREATED',
          entity: 'Reminder',
          entityId: created.id,
          metadata: {
            type,
            channel,
            memberId,
            status: dispatchResult.status,
            trigger
          }
        }
      });

      return created;
    });

    return reminder;
  }

  /**
   * Update reminder status
   */
  static async updateReminderStatus({ gymId, reminderId, status, failureReason }) {
    await this.getReminderById({ gymId, reminderId });

    const data = { status };
    if (status === 'SENT' || status === 'DELIVERED') {
      data.sentAt = new Date();
    }
    if (failureReason !== undefined) {
      data.failureReason = failureReason;
    }

    const updated = await prisma.reminder.update({
      where: { id: reminderId },
      data
    });

    return updated;
  }

  /**
   * Delete reminder
   */
  static async deleteReminder({ gymId, reminderId }) {
    const reminder = await this.getReminderById({ gymId, reminderId });

    if (reminder.status === 'SENT' || reminder.status === 'DELIVERED') {
      const error = new Error('Cannot delete a reminder that has already been dispatched.');
      error.statusCode = 400;
      throw error;
    }

    await prisma.reminder.delete({
      where: { id: reminderId }
    });

    return { success: true, message: 'Reminder deleted successfully' };
  }
}

export default ReminderService;
