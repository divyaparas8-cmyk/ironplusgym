import prisma from '../prisma.js';
import auditLogService from './auditLogService.js';

export class MemberService {
  /**
   * Helper: Generate a unique member ID within the tenant gym (format: MEM-XXXX)
   * @param {string} gymId 
   * @returns {Promise<string>}
   */
  static async generateUniqueMemberId(gymId) {
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      attempts++;
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const candidateId = `MEM-${randomDigits}`;

      const existing = await prisma.member.findUnique({
        where: {
          gymId_memberId: {
            gymId,
            memberId: candidateId
          }
        },
        select: { id: true }
      });

      if (!existing) {
        return candidateId;
      }
    }

    // Fallback: use timestamp based suffix
    const fallbackSuffix = Date.now().toString().slice(-4);
    return `MEM-${fallbackSuffix}`;
  }

  /**
   * List members with pagination, filtering, search, and sorting
   * @param {Object} params - { gymId, page, limit, search, status, sortBy, sortOrder }
   */
  static async getMembers({ gymId, page = 1, limit = 20, search, status, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const where = { gymId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { memberId: { contains: search } }
      ];
    }

    const total = await prisma.member.count({ where });

    const members = await prisma.member.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder
      },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                billingFrequency: true
              }
            }
          }
        }
      }
    });

    return {
      members,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    };
  }

  /**
   * Retrieve member details by ID scoped to tenant gym
   * @param {Object} params - { gymId, memberId }
   */
  static async getMemberById({ gymId, memberId }) {
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        gymId
      },
      include: {
        memberships: {
          include: {
            plan: true
          }
        },
        paymentMethods: {
          select: {
            id: true,
            provider: true,
            type: true,
            brand: true,
            last4: true,
            expMonth: true,
            expYear: true,
            isDefault: true,
            status: true,
            createdAt: true
          }
        },
        payments: {
          take: 10,
          orderBy: { transactionDate: 'desc' },
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            paymentMethodType: true,
            transactionDate: true,
            settledDate: true,
            failureReason: true
          }
        },
        invoices: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            subtotal: true,
            tax: true,
            total: true,
            dueDate: true,
            status: true,
            paidAt: true
          }
        }
      }
    });

    if (!member) {
      const error = new Error('Member not found');
      error.statusCode = 404;
      throw error;
    }

    return member;
  }

  /**
   * Create a new member scoped to tenant gym
   * @param {Object} params - { gymId, data }
   */
  static async createMember({ gymId, data }) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // Check duplicate email within the same gym tenant
    const duplicateEmail = await prisma.member.findFirst({
      where: {
        gymId,
        email: normalizedEmail
      },
      select: { id: true }
    });

    if (duplicateEmail) {
      const error = new Error('A member with this email address already exists');
      error.statusCode = 409;
      throw error;
    }

    // Generate unique memberId (e.g. MEM-8021)
    const memberId = await this.generateUniqueMemberId(gymId);

    const createdMember = await prisma.member.create({
      data: {
        gymId,
        memberId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: normalizedEmail,
        phone: data.phone ? data.phone.trim() : null,
        avatar: data.avatar ? data.avatar.trim() : null,
        dob: data.dob ? new Date(data.dob) : null,
        emergencyContact: data.emergencyContact ? data.emergencyContact.trim() : null,
        notes: data.notes ? data.notes.trim() : null,
        status: data.status || 'ACTIVE',
        joinDate: data.joinDate ? new Date(data.joinDate) : new Date()
      }
    });

    return createdMember;
  }

  /**
   * Composite Enrollment Flow: Atomically creates Member, Membership, PaymentMethod (if applicable),
   * Initial Invoice (with sales tax calculation), RecurringBilling schedule, and AuditLog in a single transaction.
   */
  static async enrollMember({ gymId, userId, data }) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // Check duplicate email within the same gym tenant
    const duplicateEmail = await prisma.member.findFirst({
      where: {
        gymId,
        email: normalizedEmail
      },
      select: { id: true }
    });

    if (duplicateEmail) {
      const error = new Error('A member with this email address already exists');
      error.statusCode = 409;
      throw error;
    }

    const memberIdCode = await this.generateUniqueMemberId(gymId);

    // Fetch tenant billing policy for sales tax
    const policy = await prisma.billingPolicy.findUnique({
      where: { gymId }
    });
    const salesTaxRate = policy ? Number(policy.salesTaxPercentage) || 0 : 0;

    let plan = null;
    if (data.planId) {
      plan = await prisma.membershipPlan.findFirst({
        where: { id: data.planId, gymId }
      });
      if (!plan) {
        const error = new Error('Selected membership plan not found');
        error.statusCode = 404;
        throw error;
      }
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Create Member
      const member = await tx.member.create({
        data: {
          gymId,
          memberId: memberIdCode,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: normalizedEmail,
          phone: data.phone ? data.phone.trim() : null,
          avatar: data.avatar ? data.avatar.trim() : null,
          dob: data.dob ? new Date(data.dob) : null,
          emergencyContact: data.emergencyContact ? data.emergencyContact.trim() : null,
          notes: data.notes ? data.notes.trim() : null,
          status: data.status || 'ACTIVE',
          joinDate: data.startDate ? new Date(data.startDate) : new Date()
        }
      });

      let membership = null;
      let invoice = null;
      let recurringBilling = null;
      let paymentMethod = null;

      // 2. Create PaymentMethod if electronic details provided
      const rawMethod = data.paymentMethod ? String(data.paymentMethod).toUpperCase() : 'CARD';
      const isElectronic = !['CASH', 'POS'].includes(rawMethod);
      if (isElectronic) {
        paymentMethod = await tx.paymentMethod.create({
          data: {
            gymId,
            memberId: member.id,
            provider: data.provider || 'STRIPE',
            providerPaymentMethodId: data.providerPaymentMethodId || null,
            type: rawMethod.includes('ACH') ? 'ACH' : 'CARD',
            brand: data.brand || (rawMethod.includes('ACH') ? 'ACH' : 'Visa'),
            last4: data.last4 ? String(data.last4).slice(-4) : '4242',
            expMonth: data.expMonth ? parseInt(data.expMonth, 10) : 12,
            expYear: data.expYear ? parseInt(data.expYear, 10) : new Date().getFullYear() + 3,
            isDefault: true,
            status: 'ACTIVE'
          }
        });
      }

      // 3. Create Membership if plan selected
      if (plan) {
        const price = data.recurringAmount !== undefined ? Number(data.recurringAmount) : (data.monthlyFee !== undefined ? Number(data.monthlyFee) : Number(plan.price));
        const freqMap = {
          'MONTHLY': 'MONTHLY',
          'Monthly': 'MONTHLY',
          'QUARTERLY': 'QUARTERLY',
          'Quarterly': 'QUARTERLY',
          'ANNUALLY': 'ANNUALLY',
          'Annually': 'ANNUALLY',
          'Annual': 'ANNUALLY'
        };
        const billingFrequency = freqMap[data.billingFrequency] || plan.billingFrequency || 'MONTHLY';
        const startDate = data.startDate ? new Date(data.startDate) : new Date();

        let nextBillingDate = data.nextPaymentDate ? new Date(data.nextPaymentDate) : null;
        if (!nextBillingDate) {
          nextBillingDate = new Date(startDate);
          if (billingFrequency === 'ANNUALLY') nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          else if (billingFrequency === 'QUARTERLY') nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
          else nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }

        membership = await tx.membership.create({
          data: {
            gymId,
            memberId: member.id,
            planId: plan.id,
            price,
            billingFrequency,
            startDate,
            nextBillingDate,
            status: 'ACTIVE'
          }
        });

        // 4. Create Initial Invoice with sales tax calculation
        const subtotal = price;
        const tax = Math.round((subtotal * (salesTaxRate / 100)) * 100) / 100;
        const total = subtotal + tax;
        const year = new Date().getFullYear();
        const randSuffix = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-${year}-${randSuffix}-${Date.now().toString().slice(-4)}`;

        invoice = await tx.invoice.create({
          data: {
            gymId,
            memberId: member.id,
            membershipId: membership.id,
            invoiceNumber,
            subtotal,
            tax,
            total,
            dueDate: startDate,
            status: 'OPEN',
            notes: `Initial registration invoice for ${plan.name} (${billingFrequency})`
          }
        });

        // 5. Create RecurringBilling schedule
        recurringBilling = await tx.recurringBilling.create({
          data: {
            gymId,
            memberId: member.id,
            membershipId: membership.id,
            amount: total,
            currency: 'USD',
            billingFrequency,
            nextBillingDate,
            status: 'ACTIVE'
          }
        });
      }

      // 6. Create AuditLog entry
      await tx.auditLog.create({
        data: {
          gymId,
          userId: userId || null,
          action: 'MEMBER_ENROLLED',
          entity: 'Member',
          entityId: member.id,
          metadata: {
            memberId: member.memberId,
            planId: plan?.id,
            membershipId: membership?.id,
            invoiceId: invoice?.id,
            hasPaymentMethod: Boolean(paymentMethod)
          }
        }
      });

      return {
        member,
        membership,
        paymentMethod,
        invoice,
        recurringBilling
      };
    });
  }

  /**
   * Update member profile fields scoped to tenant gym
   * @param {Object} params - { gymId, memberId, data }
   */
  static async updateMember({ gymId, memberId, data }) {
    // Verify member exists within tenant gym
    const existing = await prisma.member.findFirst({
      where: {
        id: memberId,
        gymId
      },
      select: { id: true, email: true }
    });

    if (!existing) {
      const error = new Error('Member not found');
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName.trim();
    if (data.lastName !== undefined) updateData.lastName = data.lastName.trim();
    if (data.phone !== undefined) updateData.phone = data.phone ? data.phone.trim() : null;
    if (data.avatar !== undefined) updateData.avatar = data.avatar ? data.avatar.trim() : null;
    if (data.dob !== undefined) updateData.dob = data.dob ? new Date(data.dob) : null;
    if (data.emergencyContact !== undefined) updateData.emergencyContact = data.emergencyContact ? data.emergencyContact.trim() : null;
    if (data.notes !== undefined) updateData.notes = data.notes ? data.notes.trim() : null;
    if (data.status !== undefined) updateData.status = data.status;

    // Check duplicate email if changing email
    if (data.email !== undefined) {
      const normalizedEmail = data.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email) {
        const duplicate = await prisma.member.findFirst({
          where: {
            gymId,
            email: normalizedEmail,
            id: { not: memberId }
          },
          select: { id: true }
        });

        if (duplicate) {
          const error = new Error('A member with this email address already exists');
          error.statusCode = 409;
          throw error;
        }

        updateData.email = normalizedEmail;
      }
    }

    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: updateData
    });

    auditLogService.logAction(gymId, {
      action: 'MEMBER_UPDATED',
      entity: 'Member',
      entityId: memberId,
      metadata: { fieldsUpdated: Object.keys(updateData) }
    }).catch(() => {});

    return updatedMember;
  }

  /**
   * Update member status only
   * @param {Object} params - { gymId, memberId, status }
   */
  static async updateMemberStatus({ gymId, memberId, status }) {
    const existing = await prisma.member.findFirst({
      where: {
        id: memberId,
        gymId
      },
      select: { id: true }
    });

    if (!existing) {
      const error = new Error('Member not found');
      error.statusCode = 404;
      throw error;
    }

    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: { status }
    });

    auditLogService.logAction(gymId, {
      action: 'MEMBER_STATUS_CHANGED',
      entity: 'Member',
      entityId: memberId,
      metadata: { newStatus: status }
    }).catch(() => {});

    return updatedMember;
  }

  /**
   * Delete member or reject if active financial records exist
   * @param {Object} params - { gymId, memberId }
   */
  static async deleteMember({ gymId, memberId }) {
    const existing = await prisma.member.findFirst({
      where: {
        id: memberId,
        gymId
      },
      select: {
        id: true,
        _count: {
          select: {
            payments: true,
            invoices: true
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Member not found');
      error.statusCode = 404;
      throw error;
    }

    // Preserve financial history integrity
    if (existing._count.payments > 0 || existing._count.invoices > 0) {
      const error = new Error('Cannot permanently delete member with existing payment or invoice history. Please deactivate or change status to PAUSED instead.');
      error.statusCode = 409;
      throw error;
    }

    await prisma.member.delete({
      where: { id: memberId }
    });

    auditLogService.logAction(gymId, {
      action: 'MEMBER_DELETED',
      entity: 'Member',
      entityId: memberId
    }).catch(() => {});

    return {
      message: 'Member deleted successfully'
    };
  }
}

export default MemberService;
