const VALID_BILLING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const VALID_SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE'];
const ALLOWED_SORT_FIELDS = ['nextBillingDate', 'amount', 'status', 'createdAt', 'billingFrequency'];

export const ALLOWED_SUBSCRIPTION_STATUS_TRANSITIONS = {
  ACTIVE: ['PAUSED', 'CANCELLED', 'PAST_DUE'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'PAUSED', 'CANCELLED'],
  CANCELLED: [] // Terminal state
};

/**
 * Validate query parameters for GET /api/recurring-billing
 */
export const validateGetRecurringBillingsQuery = (query = {}) => {
  const errors = [];
  const sanitized = {};

  // Page
  if (query.page !== undefined) {
    const page = parseInt(query.page, 10);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be an integer greater than or equal to 1');
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

  // MemberId filter
  if (query.memberId !== undefined && query.memberId !== '') {
    sanitized.memberId = String(query.memberId).trim();
  }

  // MembershipId filter
  if (query.membershipId !== undefined && query.membershipId !== '') {
    sanitized.membershipId = String(query.membershipId).trim();
  }

  // Status filter
  if (query.status !== undefined && query.status !== '') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_SUBSCRIPTION_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
    }
  }

  // BillingFrequency filter
  if (query.billingFrequency !== undefined && query.billingFrequency !== '') {
    const freqUpper = query.billingFrequency.toUpperCase();
    if (!VALID_BILLING_FREQUENCIES.includes(freqUpper)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    } else {
      sanitized.billingFrequency = freqUpper;
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
    sanitized.sortBy = 'nextBillingDate';
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
    sanitized.sortOrder = 'asc';
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};

/**
 * Validate body for POST /api/recurring-billing
 */
export const validateCreateRecurringBilling = (data = {}) => {
  const errors = [];

  // memberId
  if (!data.memberId || typeof data.memberId !== 'string' || !data.memberId.trim()) {
    errors.push('memberId is required and must be a non-empty string');
  }

  // membershipId
  if (!data.membershipId || typeof data.membershipId !== 'string' || !data.membershipId.trim()) {
    errors.push('membershipId is required and must be a non-empty string');
  }

  // amount
  if (data.amount === undefined || data.amount === null) {
    errors.push('amount is required');
  } else {
    const amountNum = Number(data.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      errors.push('amount must be a positive number greater than 0');
    }
  }

  // currency (optional, default USD)
  if (data.currency !== undefined && (typeof data.currency !== 'string' || data.currency.trim().length !== 3)) {
    errors.push('currency must be a 3-letter ISO code (e.g. USD)');
  }

  // billingFrequency (optional, default MONTHLY)
  if (data.billingFrequency !== undefined) {
    const freqUpper = String(data.billingFrequency).toUpperCase();
    if (!VALID_BILLING_FREQUENCIES.includes(freqUpper)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    }
  }

  // nextBillingDate
  if (!data.nextBillingDate) {
    errors.push('nextBillingDate is required');
  } else {
    const date = new Date(data.nextBillingDate);
    if (isNaN(date.getTime())) {
      errors.push('nextBillingDate must be a valid ISO date');
    }
  }

  // status (optional, defaults to ACTIVE)
  if (data.status !== undefined && data.status !== null) {
    const statusUpper = String(data.status).toUpperCase();
    if (!VALID_SUBSCRIPTION_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/recurring-billing/:id
 */
export const validateUpdateRecurringBilling = (data = {}) => {
  const errors = [];

  // Check forbidden fields
  if (data.id !== undefined) errors.push('ID cannot be modified');
  if (data.gymId !== undefined) errors.push('Gym assignment cannot be modified');
  if (data.memberId !== undefined) errors.push('Member assignment cannot be modified');
  if (data.membershipId !== undefined) errors.push('Membership assignment cannot be modified');

  // amount
  if (data.amount !== undefined) {
    const amountNum = Number(data.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      errors.push('amount must be a positive number greater than 0');
    }
  }

  // billingFrequency
  if (data.billingFrequency !== undefined) {
    const freqUpper = String(data.billingFrequency).toUpperCase();
    if (!VALID_BILLING_FREQUENCIES.includes(freqUpper)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    }
  }

  // nextBillingDate
  if (data.nextBillingDate !== undefined) {
    const date = new Date(data.nextBillingDate);
    if (isNaN(date.getTime())) {
      errors.push('nextBillingDate must be a valid ISO date');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/recurring-billing/:id/status
 */
export const validateUpdateRecurringBillingStatus = (data = {}) => {
  const errors = [];

  if (!data.status) {
    errors.push('status is required');
  } else {
    const statusUpper = String(data.status).toUpperCase();
    if (!VALID_SUBSCRIPTION_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
