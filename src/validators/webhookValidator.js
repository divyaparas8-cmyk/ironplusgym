/**
 * Validate incoming normalized webhook event payload
 */
export const validateWebhookEvent = (event) => {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return {
      isValid: false,
      errors: ['Webhook payload must be a valid JSON object']
    };
  }

  // Event ID
  if (!event.id || typeof event.id !== 'string' || !event.id.trim()) {
    errors.push('Event ID is required and must be a non-empty string');
  }

  // Event Type
  if (!event.type || typeof event.type !== 'string' || !event.type.trim()) {
    errors.push('Event type is required and must be a non-empty string');
  }

  // Event Data
  if (!event.data || typeof event.data !== 'object') {
    errors.push('Event data object is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
