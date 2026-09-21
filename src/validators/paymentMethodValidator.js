const VALID_PAYMENT_METHOD_TYPES = ['CARD', 'ACH', 'CASH', 'POS'];
const VALID_PAYMENT_METHOD_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'type', 'brand', 'status'];

/**
 * Validate query parameters for GET /api/payment-methods
 */
export const validateGetPaymentMethodsQuery = (query = {}) => {
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

  // Type filter
  if (query.type !== undefined && query.type !== '') {
    const typeUpper = query.type.toUpperCase();
    if (!VALID_PAYMENT_METHOD_TYPES.includes(typeUpper)) {
      errors.push(`type must be one of: ${VALID_PAYMENT_METHOD_TYPES.join(', ')}`);
    } else {
      sanitized.type = typeUpper;
    }
  }

  // Status filter
  if (query.status !== undefined && query.status !== '') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_PAYMENT_METHOD_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_PAYMENT_METHOD_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
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
 * Validate body for POST /api/payment-methods
 * PCI-Sensitive / PCI-Safe: Explicitly reject raw card number, CVV, bank passwords.
 */
export const validateCreatePaymentMethod = (data = {}) => {
  const errors = [];

  // Security check: Never allow raw card numbers, CVVs, or passwords
  if (data.cardNumber || data.card_number || data.number) {
    errors.push('Raw card numbers are strictly prohibited. Use tokenized provider references.');
  }
  if (data.cvv || data.cvc || data.securityCode || data.security_code) {
    errors.push('CVV/CVC storage is strictly prohibited.');
  }
  if (data.bankPassword || data.bankAccountPassword || data.pin) {
    errors.push('Raw bank passwords or PINs are strictly prohibited.');
  }

  // memberId
  if (!data.memberId || typeof data.memberId !== 'string' || !data.memberId.trim()) {
    errors.push('memberId is required and must be a non-empty string');
  }

  // provider
  if (!data.provider || typeof data.provider !== 'string' || !data.provider.trim()) {
    errors.push('provider is required (e.g. STRIPE, MANUAL, AUTHORIZE_NET)');
  }

  // type
  if (!data.type || !VALID_PAYMENT_METHOD_TYPES.includes(String(data.type).toUpperCase())) {
    errors.push(`type is required and must be one of: ${VALID_PAYMENT_METHOD_TYPES.join(', ')}`);
  }

  // brand
  if (data.brand !== undefined && (typeof data.brand !== 'string' || !data.brand.trim())) {
    errors.push('brand must be a non-empty string if provided');
  }

  // last4
  if (data.last4 !== undefined && data.last4 !== null) {
    const last4Str = String(data.last4).trim();
    if (!/^\d{4}$/.test(last4Str)) {
      errors.push('last4 must be exactly 4 digits');
    }
  }

  // expMonth
  if (data.expMonth !== undefined && data.expMonth !== null) {
    const month = parseInt(data.expMonth, 10);
    if (isNaN(month) || month < 1 || month > 12) {
      errors.push('expMonth must be an integer between 1 and 12');
    }
  }

  // expYear
  if (data.expYear !== undefined && data.expYear !== null) {
    const year = parseInt(data.expYear, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < currentYear || year > currentYear + 30) {
      errors.push(`expYear must be a valid 4-digit year >= ${currentYear}`);
    }
  }

  // status
  if (data.status !== undefined && !VALID_PAYMENT_METHOD_STATUSES.includes(String(data.status).toUpperCase())) {
    errors.push(`status must be one of: ${VALID_PAYMENT_METHOD_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/payment-methods/:id
 */
export const validateUpdatePaymentMethod = (data = {}) => {
  const errors = [];

  // Security check: Never allow raw card numbers or CVV
  if (data.cardNumber || data.card_number || data.number || data.cvv || data.cvc) {
    errors.push('Raw card numbers and CVVs are strictly prohibited.');
  }

  // Check forbidden fields
  if (data.id !== undefined) {
    errors.push('Payment method ID cannot be modified');
  }
  if (data.gymId !== undefined) {
    errors.push('Gym assignment cannot be modified');
  }
  if (data.memberId !== undefined) {
    errors.push('Member assignment cannot be modified');
  }

  // brand
  if (data.brand !== undefined && (typeof data.brand !== 'string' || !data.brand.trim())) {
    errors.push('brand must be a non-empty string if provided');
  }

  // last4
  if (data.last4 !== undefined && data.last4 !== null) {
    const last4Str = String(data.last4).trim();
    if (!/^\d{4}$/.test(last4Str)) {
      errors.push('last4 must be exactly 4 digits');
    }
  }

  // expMonth
  if (data.expMonth !== undefined && data.expMonth !== null) {
    const month = parseInt(data.expMonth, 10);
    if (isNaN(month) || month < 1 || month > 12) {
      errors.push('expMonth must be an integer between 1 and 12');
    }
  }

  // expYear
  if (data.expYear !== undefined && data.expYear !== null) {
    const year = parseInt(data.expYear, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < currentYear || year > currentYear + 30) {
      errors.push(`expYear must be a valid 4-digit year >= ${currentYear}`);
    }
  }

  // isDefault
  if (data.isDefault !== undefined && typeof data.isDefault !== 'boolean') {
    errors.push('isDefault must be a boolean');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/payment-methods/:id/status
 */
export const validateUpdatePaymentMethodStatus = (data = {}) => {
  const errors = [];

  if (!data.status) {
    errors.push('status is required');
  } else if (!VALID_PAYMENT_METHOD_STATUSES.includes(String(data.status).toUpperCase())) {
    errors.push(`status must be one of: ${VALID_PAYMENT_METHOD_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
