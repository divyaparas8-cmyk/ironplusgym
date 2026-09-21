import prisma from '../prisma.js';

// Default system fallback templates if custom template has not been created by gym
export const DEFAULT_TEMPLATES = {
  UPCOMING_PAYMENT: {
    EMAIL: {
      name: 'Default Upcoming Payment Email',
      subject: 'Upcoming Membership Dues - {{gymName}}',
      body: 'Hi {{firstName}}, your upcoming membership dues of {{currency}} {{amount}} are scheduled for automatic drafting on {{dueDate}}. Please ensure your payment method is active.'
    },
    SMS: {
      name: 'Default Upcoming Payment SMS',
      subject: null,
      body: '{{gymName}}: Your membership dues of {{currency}} {{amount}} are due on {{dueDate}}. Thank you for training with us!'
    },
    WHATSAPP: {
      name: 'Default Upcoming Payment WhatsApp',
      subject: null,
      body: 'Hello {{firstName}}! This is a friendly reminder from {{gymName}} that your membership dues of {{currency}} {{amount}} will draft on {{dueDate}}.'
    }
  },
  PAYMENT_FAILED: {
    EMAIL: {
      name: 'Default Payment Failed Email',
      subject: 'Action Required: Payment Declined - {{gymName}}',
      body: 'Hi {{firstName}}, we were unable to process your scheduled membership payment of {{currency}} {{amount}}. Our system will automatically retry. Please update your payment method to prevent access interruption.'
    },
    SMS: {
      name: 'Default Payment Failed SMS',
      subject: null,
      body: '{{gymName}} Alert: We could not process your dues of {{currency}} {{amount}}. Please update your card to avoid service suspension.'
    },
    WHATSAPP: {
      name: 'Default Payment Failed WhatsApp',
      subject: null,
      body: 'Important notice from {{gymName}}: Your latest membership charge of {{currency}} {{amount}} was unsuccessful. Please check your card on file.'
    }
  },
  OVERDUE: {
    EMAIL: {
      name: 'Default Overdue Escalation Email',
      subject: 'Urgent: Account Overdue - {{gymName}}',
      body: 'Hi {{firstName}}, your membership account is now past due. Invoice {{invoiceNumber}} for {{currency}} {{amount}} has exceeded the grace period. Please settle your balance immediately.'
    },
    SMS: {
      name: 'Default Overdue Escalation SMS',
      subject: null,
      body: '{{gymName}} URGENT: Your dues of {{currency}} {{amount}} are overdue. Please settle your account to restore facility privileges.'
    },
    WHATSAPP: {
      name: 'Default Overdue Escalation WhatsApp',
      subject: null,
      body: 'Urgent alert from {{gymName}}: Account is past due for {{currency}} {{amount}}. Please contact the front desk or settle online.'
    }
  },
  MEMBERSHIP_EXPIRY: {
    EMAIL: {
      name: 'Default Membership Expiry Email',
      subject: 'Membership Renewal Window Open - {{gymName}}',
      body: 'Hi {{firstName}}, your {{planName}} membership agreement expires on {{membershipEndDate}}. Renew today to lock in your existing rate!'
    },
    SMS: {
      name: 'Default Membership Expiry SMS',
      subject: null,
      body: '{{gymName}}: Your gym membership expires on {{membershipEndDate}}. Visit the front desk to renew your preferred rate.'
    },
    WHATSAPP: {
      name: 'Default Membership Expiry WhatsApp',
      subject: null,
      body: 'Hello {{firstName}}, your {{gymName}} membership is expiring on {{membershipEndDate}}. Speak with our team to extend your access.'
    }
  }
};

export class NotificationTemplateService {
  /**
   * List notification templates scoped to tenant gym
   */
  static async getTemplates({ gymId, type, channel, isActive }) {
    const where = { gymId };

    if (type) where.type = type;
    if (channel) where.channel = channel;
    if (isActive !== undefined) where.isActive = isActive;

    const templates = await prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return templates;
  }

  /**
   * Get single template by ID scoped to tenant gym
   */
  static async getTemplateById({ gymId, templateId }) {
    const template = await prisma.notificationTemplate.findFirst({
      where: {
        id: templateId,
        gymId
      }
    });

    if (!template) {
      const error = new Error('Notification template not found');
      error.statusCode = 404;
      throw error;
    }

    return template;
  }

  /**
   * Create a new notification template
   */
  static async createTemplate({ gymId, name, type, channel, subject, body, isActive = true }) {
    // Check name uniqueness within gym
    const existing = await prisma.notificationTemplate.findUnique({
      where: {
        gymId_name: {
          gymId,
          name: name.trim()
        }
      }
    });

    if (existing) {
      const error = new Error(`A template with the name "${name}" already exists for this gym`);
      error.statusCode = 409;
      throw error;
    }

    const template = await prisma.notificationTemplate.create({
      data: {
        gymId,
        name: name.trim(),
        type,
        channel,
        subject: subject ? subject.trim() : null,
        body: body.trim(),
        isActive
      }
    });

    return template;
  }

  /**
   * Update notification template
   */
  static async updateTemplate({ gymId, templateId, name, subject, body, isActive }) {
    await this.getTemplateById({ gymId, templateId });

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (subject !== undefined) data.subject = subject ? subject.trim() : null;
    if (body !== undefined) data.body = body.trim();
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.notificationTemplate.update({
      where: { id: templateId },
      data
    });

    return updated;
  }

  /**
   * Delete notification template
   */
  static async deleteTemplate({ gymId, templateId }) {
    await this.getTemplateById({ gymId, templateId });

    await prisma.notificationTemplate.delete({
      where: { id: templateId }
    });

    return { success: true, message: 'Notification template deleted successfully' };
  }

  /**
   * Resolve best matching template (custom from database or default system template)
   */
  static async resolveTemplate({ gymId, type, channel = 'EMAIL' }) {
    // Check if custom active template exists in DB
    const custom = await prisma.notificationTemplate.findFirst({
      where: {
        gymId,
        type,
        channel,
        isActive: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (custom) {
      return {
        subject: custom.subject,
        body: custom.body,
        isCustom: true
      };
    }

    // Fall back to built-in system template
    const defaultGroup = DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.UPCOMING_PAYMENT;
    const defaultTemplate = defaultGroup[channel] || defaultGroup.EMAIL;

    return {
      subject: defaultTemplate.subject,
      body: defaultTemplate.body,
      isCustom: false
    };
  }
}

export default NotificationTemplateService;
