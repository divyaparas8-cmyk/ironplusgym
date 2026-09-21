import prisma from '../prisma.js';

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

    return {
      message: 'Member deleted successfully'
    };
  }
}

export default MemberService;
