const VALID_MEMBERSHIP_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'];
const VALID_BILLING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const ALLOWED_SORT_FIELDS = ['startDate', 'nextBillingDate', 'endDate', 'createdAt', 'updatedAt', 'price', 'status'];

/**
 * Validate query parameters for GET /api/memberships
 */
export const validateGetMembershipsQuery = (query = {}) => {
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

  // Search
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') {
      errors.push('Search parameter must be a string');
    } else {
      sanitized.search = query.search.trim();
    }
  }

  // Status
  if (query.status !== undefined && query.status !== '') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_MEMBERSHIP_STATUSES.includes(statusUpper)) {
      errors.push(`Status must be one of: ${VALID_MEMBERSHIP_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
    }
  }

  // PlanId filter
  if (query.planId !== undefined && query.planId !== '') {
    sanitized.planId = String(query.planId).trim();
  }

  // MemberId filter
  if (query.memberId !== undefined && query.memberId !== '') {
    sanitized.memberId = String(query.memberId).trim();
  }

  // SortBy
  if (query.sortBy !== undefined && query.sortBy !== '') {
    if (!ALLOWED_SORT_FIELDS.includes(query.sortBy)) {
      errors.push(`sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}`);
    } else {
      sanitized.sortBy = query.sortBy;
    }
  } else {
    sanitized.sortBy = 'startDate';
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
 * Validate body for POST /api/memberships
 */
export const validateCreateMembership = (data = {}) => {
  const errors = [];

  // memberId
  if (!data.memberId || typeof data.memberId !== 'string' || data.memberId.trim().length === 0) {
    errors.push('memberId is required');
  }

  // planId
  if (!data.planId || typeof data.planId !== 'string' || data.planId.trim().length === 0) {
    errors.push('planId is required');
  }

  // price (optional)
  if (data.price !== undefined && data.price !== null) {
    const numPrice = Number(data.price);
    if (isNaN(numPrice) || numPrice < 0) {
      errors.push('Price must be a valid non-negative number');
    }
  }

  // billingFrequency (optional)
  if (data.billingFrequency !== undefined && data.billingFrequency !== null) {
    if (!VALID_BILLING_FREQUENCIES.includes(data.billingFrequency)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    }
  }

  // status (optional)
  if (data.status !== undefined && data.status !== null) {
    if (!VALID_MEMBERSHIP_STATUSES.includes(data.status)) {
      errors.push(`status must be one of: ${VALID_MEMBERSHIP_STATUSES.join(', ')}`);
    }
  }

  // Date validations
  let parsedStart = null;
  if (data.startDate !== undefined && data.startDate !== null && data.startDate !== '') {
    parsedStart = new Date(data.startDate);
    if (isNaN(parsedStart.getTime())) {
      errors.push('startDate must be a valid date');
    }
  }

  let parsedEnd = null;
  if (data.endDate !== undefined && data.endDate !== null && data.endDate !== '') {
    parsedEnd = new Date(data.endDate);
    if (isNaN(parsedEnd.getTime())) {
      errors.push('endDate must be a valid date');
    }
  }

  if (data.nextBillingDate !== undefined && data.nextBillingDate !== null && data.nextBillingDate !== '') {
    const parsedNext = new Date(data.nextBillingDate);
    if (isNaN(parsedNext.getTime())) {
      errors.push('nextBillingDate must be a valid date');
    }
  }

  // Chronological order check
  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    errors.push('endDate cannot be earlier than startDate');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/memberships/:id
 */
export const validateUpdateMembership = (data = {}) => {
  const errors = [];

  const allowedFields = ['planId', 'status', 'price', 'billingFrequency', 'startDate', 'endDate', 'nextBillingDate'];
  const provided = Object.keys(data).filter(k => allowedFields.includes(k));

  if (provided.length === 0) {
    errors.push('At least one valid field must be provided for update');
  }

  if (data.planId !== undefined) {
    if (typeof data.planId !== 'string' || data.planId.trim().length === 0) {
      errors.push('planId cannot be empty');
    }
  }

  if (data.status !== undefined) {
    if (!VALID_MEMBERSHIP_STATUSES.includes(data.status)) {
      errors.push(`status must be one of: ${VALID_MEMBERSHIP_STATUSES.join(', ')}`);
    }
  }

  if (data.price !== undefined) {
    const numPrice = Number(data.price);
    if (isNaN(numPrice) || numPrice < 0) {
      errors.push('Price must be a valid non-negative number');
    }
  }

  if (data.billingFrequency !== undefined) {
    if (!VALID_BILLING_FREQUENCIES.includes(data.billingFrequency)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    }
  }

  let parsedStart = null;
  if (data.startDate !== undefined && data.startDate !== null && data.startDate !== '') {
    parsedStart = new Date(data.startDate);
    if (isNaN(parsedStart.getTime())) {
      errors.push('startDate must be a valid date');
    }
  }

  let parsedEnd = null;
  if (data.endDate !== undefined && data.endDate !== null && data.endDate !== '') {
    parsedEnd = new Date(data.endDate);
    if (isNaN(parsedEnd.getTime())) {
      errors.push('endDate must be a valid date');
    }
  }

  if (data.nextBillingDate !== undefined && data.nextBillingDate !== null && data.nextBillingDate !== '') {
    const parsedNext = new Date(data.nextBillingDate);
    if (isNaN(parsedNext.getTime())) {
      errors.push('nextBillingDate must be a valid date');
    }
  }

  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    errors.push('endDate cannot be earlier than startDate');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/memberships/:id/status
 */
export const validateUpdateMembershipStatus = (data = {}) => {
  const errors = [];

  if (!data.status || typeof data.status !== 'string') {
    errors.push('Status is required');
  } else if (!VALID_MEMBERSHIP_STATUSES.includes(data.status)) {
    errors.push(`Status must be one of: ${VALID_MEMBERSHIP_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
