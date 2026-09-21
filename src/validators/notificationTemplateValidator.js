const VALID_REMINDER_TYPES = ['UPCOMING_PAYMENT', 'PAYMENT_FAILED', 'OVERDUE', 'MEMBERSHIP_EXPIRY'];
const VALID_REMINDER_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'];

/**
 * Validate body for POST /api/notification-templates
 */
export const validateCreateTemplate = (data = {}) => {
  const errors = [];

  // Name
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name is required');
  } else if (data.name.trim().length > 100) {
    errors.push('name cannot exceed 100 characters');
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

  // Channel
  if (!data.channel) {
    errors.push(`channel is required and must be one of: ${VALID_REMINDER_CHANNELS.join(', ')}`);
  } else {
    const channelUpper = String(data.channel).toUpperCase();
    if (!VALID_REMINDER_CHANNELS.includes(channelUpper)) {
      errors.push(`channel must be one of: ${VALID_REMINDER_CHANNELS.join(', ')}`);
    }
  }

  // Body
  if (!data.body || typeof data.body !== 'string' || data.body.trim().length === 0) {
    errors.push('body is required and must be a non-empty string');
  }

  // Subject (optional, but if provided must be string)
  if (data.subject !== undefined && data.subject !== null && typeof data.subject !== 'string') {
    errors.push('subject must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/notification-templates/:id
 */
export const validateUpdateTemplate = (data = {}) => {
  const errors = [];

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('name must be a non-empty string');
    }
  }

  if (data.body !== undefined) {
    if (typeof data.body !== 'string' || data.body.trim().length === 0) {
      errors.push('body must be a non-empty string');
    }
  }

  if (data.subject !== undefined && data.subject !== null && typeof data.subject !== 'string') {
    errors.push('subject must be a string');
  }

  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
