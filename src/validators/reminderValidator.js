const VALID_REMINDER_TYPES = ['UPCOMING_PAYMENT', 'PAYMENT_FAILED', 'OVERDUE', 'MEMBERSHIP_EXPIRY'];
const VALID_REMINDER_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'];
const VALID_REMINDER_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'scheduledAt', 'sentAt', 'status', 'type', 'channel'];

/**
 * Validate query parameters for GET /api/reminders
 */
export const validateGetRemindersQuery = (query = {}) => {
  const errors = [];
  const sanitized = {};

  // Page
  if (query.page !== undefined) {
    const page = parseInt(query.page, 10);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive integer greater than or equal to 1');
    } else {
      sanitized.page = page;
    }
  } else {
    sanitized.page = 1;
  }

  // Limit
  if (query.limit !== undefined) {
    const limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errors.push('Limit must be an integer between 1 and 100');
    } else {
      sanitized.limit = limit;
    }
  } else {
    sanitized.limit = 20;
  }

  // Member ID
  if (query.memberId !== undefined && query.memberId !== '') {
    sanitized.memberId = String(query.memberId).trim();
  }

  // Status
  if (query.status !== undefined && query.status !== '' && query.status !== 'All') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_REMINDER_STATUSES.includes(statusUpper)) {
      errors.push(`Status must be one of: ${VALID_REMINDER_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
    }
  }

  // Type
  if (query.type !== undefined && query.type !== '' && query.type !== 'All') {
    const typeUpper = query.type.toUpperCase();
    if (!VALID_REMINDER_TYPES.includes(typeUpper)) {
      errors.push(`Type must be one of: ${VALID_REMINDER_TYPES.join(', ')}`);
    } else {
      sanitized.type = typeUpper;
    }
  }

  // Channel
  if (query.channel !== undefined && query.channel !== '' && query.channel !== 'All') {
    const channelUpper = query.channel.toUpperCase();
    if (!VALID_REMINDER_CHANNELS.includes(channelUpper)) {
      errors.push(`Channel must be one of: ${VALID_REMINDER_CHANNELS.join(', ')}`);
    } else {
      sanitized.channel = channelUpper;
    }
  }

  // SortBy
  if (query.sortBy !== undefined && query.sortBy !== '') {
    if (!ALLOWED_SORT_FIELDS.includes(query.sortBy)) {
      errors.push(`sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}`);
    } else {
      sanitized.sortBy = query.sortBy;
    }
  } else {
    sanitized.sortBy = 'createdAt';
  }

  // SortOrder
  if (query.sortOrder !== undefined && query.sortOrder !== '') {
    const orderLower = query.sortOrder.toLowerCase();
    if (!['asc', 'desc'].includes(orderLower)) {
      errors.push("sortOrder must be 'asc' or 'desc'");
    } else {
      sanitized.sortOrder = orderLower;
    }
  } else {
    sanitized.sortOrder = 'desc';
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};

/**
 * Validate body for POST /api/reminders
 */
export const validateCreateReminder = (data = {}) => {
  const errors = [];

  // Member ID
  if (!data.memberId || typeof data.memberId !== 'string' || data.memberId.trim().length === 0) {
    errors.push('memberId is required');
  }

  // Type
  if (!data.type) {
    errors.push(`type is required and must be one of: ${VALID_REMINDER_TYPES.join(', ')}`);
  } else {
    const typeUpper = String(data.type).toUpperCase();
    if (!VALID_REMINDER_TYPES.includes(typeUpper)) {
      errors.push(`type must be one of: ${VALID_REMINDER_TYPES.join(', ')}`);
    }
  }

  // Channel (optional, default EMAIL)
  if (data.channel) {
    const channelUpper = String(data.channel).toUpperCase();
    if (!VALID_REMINDER_CHANNELS.includes(channelUpper)) {
      errors.push(`channel must be one of: ${VALID_REMINDER_CHANNELS.join(', ')}`);
    }
  }

  // Optional relations
  if (data.paymentId && typeof data.paymentId !== 'string') {
    errors.push('paymentId must be a string');
  }
  if (data.invoiceId && typeof data.invoiceId !== 'string') {
    errors.push('invoiceId must be a string');
  }
  if (data.membershipId && typeof data.membershipId !== 'string') {
    errors.push('membershipId must be a string');
  }

  // Message (optional if resolved from template, but if provided must be non-empty string)
  if (data.message !== undefined && data.message !== null) {
    if (typeof data.message !== 'string' || data.message.trim().length === 0) {
      errors.push('message must be a non-empty string if provided');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/reminders/:id/status
 */
export const validateUpdateReminderStatus = (data = {}) => {
  const errors = [];

  if (!data.status) {
    errors.push(`status is required and must be one of: ${VALID_REMINDER_STATUSES.join(', ')}`);
  } else {
    const statusUpper = String(data.status).toUpperCase();
    if (!VALID_REMINDER_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_REMINDER_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
