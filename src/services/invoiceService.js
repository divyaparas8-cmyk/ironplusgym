import prisma from '../prisma.js';
import { ALLOWED_INVOICE_STATUS_TRANSITIONS } from '../validators/invoiceValidator.js';

class InvoiceService {
  /**
   * Generate collision-resistant unique invoice number within gym
   */
  async generateInvoiceNumber(gymId) {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    for (let attempts = 0; attempts < 5; attempts++) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `${prefix}${randomSuffix}`;

      const existing = await prisma.invoice.findUnique({
        where: {
          gymId_invoiceNumber: {
            gymId,
            invoiceNumber: candidate
          }
        }
      });

      if (!existing) {
        return candidate;
      }
    }

    // Fallback using timestamp
    const timestampSuffix = Date.now().toString().slice(-4);
    return `${prefix}${timestampSuffix}`;
  }

  /**
   * List invoices with pagination, filtering, search
   */
  async getInvoices({
    gymId,
    page = 1,
    limit = 20,
    search,
    memberId,
    status,
    fromDate,
    toDate,
    sortBy = 'dueDate',
    sortOrder = 'desc'
  }) {
    const skip = (page - 1) * limit;

    const where = {
      gymId
    };

    if (search) {
      where.invoiceNumber = {
        contains: search
      };
    }

    if (memberId) {
      where.memberId = memberId;
    }

    if (status) {
      where.status = status;
    }

    if (fromDate || toDate) {
      where.dueDate = {};
      if (fromDate) where.dueDate.gte = fromDate;
      if (toDate) where.dueDate.lte = toDate;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
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
              email: true
            }
          },
          membership: {
            select: {
              id: true,
              planId: true,
              status: true
            }
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              transactionDate: true
            }
          }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single invoice by ID (tenant-scoped)
   */
  async getInvoiceById({ gymId, invoiceId }) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
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
            phone: true
          }
        },
        membership: {
          select: {
            id: true,
            planId: true,
            status: true,
            startDate: true,
            endDate: true,
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                billingFrequency: true
              }
            }
          }
        },
        payments: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            paymentMethodType: true,
            transactionDate: true,
            settledDate: true
          }
        }
      }
    });

    if (!invoice) {
      const error = new Error('Invoice not found');
      error.statusCode = 404;
      throw error;
    }

    return invoice;
  }

  /**
   * Create invoice
   */
  async createInvoice({ gymId, data }) {
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

    // 2. If membershipId is provided, verify it belongs to this gym
    if (data.membershipId) {
      const membership = await prisma.membership.findFirst({
        where: {
          id: data.membershipId,
          gymId
        }
      });

      if (!membership) {
        const error = new Error('Membership not found in current gym');
        error.statusCode = 404;
        throw error;
      }
    }

    // 3. Determine or generate unique invoiceNumber
    let invoiceNumber = data.invoiceNumber ? data.invoiceNumber.trim() : null;
    if (!invoiceNumber) {
      invoiceNumber = await this.generateInvoiceNumber(gymId);
    } else {
      const existing = await prisma.invoice.findUnique({
        where: {
          gymId_invoiceNumber: {
            gymId,
            invoiceNumber
          }
        }
      });

      if (existing) {
        const error = new Error(`Invoice number '${invoiceNumber}' already exists for this gym`);
        error.statusCode = 409;
        throw error;
      }
    }

    const subtotal = Number(data.subtotal);
    const tax = data.tax !== undefined ? Number(data.tax) : 0.00;
    const total = Number(data.total);

    const invoice = await prisma.invoice.create({
      data: {
        gymId,
        memberId: data.memberId,
        membershipId: data.membershipId || null,
        invoiceNumber,
        subtotal,
        tax,
        total,
        dueDate: new Date(data.dueDate),
        status: data.status || 'OPEN',
        paidAt: data.status === 'PAID' ? new Date() : null,
        notes: data.notes ? data.notes.trim() : null
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
        }
      }
    });

    return invoice;
  }

  /**
   * Update invoice (protect settled financial history)
   */
  async updateInvoice({ gymId, invoiceId, data }) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Invoice not found');
      error.statusCode = 404;
      throw error;
    }

    // Financial integrity check: If already PAID or VOID, prevent modifying financial amounts
    if (existing.status === 'PAID' || existing.status === 'VOID') {
      if (data.subtotal !== undefined || data.tax !== undefined || data.total !== undefined) {
        const error = new Error(
          `Financial amounts cannot be modified on an invoice with status '${existing.status}'. Historical integrity is protected.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    const updatePayload = {};

    if (data.dueDate !== undefined) {
      updatePayload.dueDate = new Date(data.dueDate);
    }

    if (data.notes !== undefined) {
      updatePayload.notes = data.notes ? data.notes.trim() : null;
    }

    // If updating financial amounts on unpaid invoice
    if (data.subtotal !== undefined || data.tax !== undefined || data.total !== undefined) {
      const newSubtotal = data.subtotal !== undefined ? Number(data.subtotal) : Number(existing.subtotal);
      const newTax = data.tax !== undefined ? Number(data.tax) : Number(existing.tax);
      const newTotal = data.total !== undefined ? Number(data.total) : Number(existing.total);

      const expectedTotal = Math.round((newSubtotal + newTax) * 100) / 100;
      const actualTotal = Math.round(newTotal * 100) / 100;
      if (Math.abs(expectedTotal - actualTotal) > 0.001) {
        const error = new Error(`Inconsistent financial calculation: subtotal + tax must equal total`);
        error.statusCode = 400;
        throw error;
      }

      updatePayload.subtotal = newSubtotal;
      updatePayload.tax = newTax;
      updatePayload.total = newTotal;
    }

    return await prisma.invoice.update({
      where: { id: invoiceId },
      data: updatePayload,
      include: {
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
  }

  /**
   * Update invoice status with state-machine transition validation
   */
  async updateInvoiceStatus({ gymId, invoiceId, status }) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        gymId
      }
    });

    if (!existing) {
      const error = new Error('Invoice not found');
      error.statusCode = 404;
      throw error;
    }

    // State machine check
    const allowedTransitions = ALLOWED_INVOICE_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(status)) {
      const error = new Error(
        `Invalid status transition: Cannot change status from '${existing.status}' to '${status}'`
      );
      error.statusCode = 400;
      throw error;
    }

    const dataToUpdate = {
      status
    };

    if (status === 'PAID' && !existing.paidAt) {
      dataToUpdate.paidAt = new Date();
    }

    return await prisma.invoice.update({
      where: { id: invoiceId },
      data: dataToUpdate
    });
  }
}

export default new InvoiceService();
