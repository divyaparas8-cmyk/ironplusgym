import prisma from '../prisma.js';

export const auditLogService = {
  async logAction(gymId, { userId = null, action, entity, entityId = null, metadata = null }) {
    return prisma.auditLog.create({
      data: {
        gymId,
        userId,
        action,
        entity,
        entityId,
        metadata
      }
    });
  },

  async getMemberLogs(gymId, memberId) {
    return prisma.auditLog.findMany({
      where: {
        gymId,
        OR: [
          { entityId: memberId },
          { entity: 'Member', entityId: memberId }
        ]
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  },

  async getRecentLogs(gymId, limit = 50) {
    return prisma.auditLog.findMany({
      where: { gymId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });
  }
};

export default auditLogService;
