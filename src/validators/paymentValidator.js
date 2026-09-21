const VALID_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'OVERDUE'];
const VALID_PAYMENT_METHOD_TYPES = ['CARD', 'ACH', 'CASH', 'POS'];
const ALLOWED_SORT_FIELDS = ['transactionDate', 'settledDate', 'amount', 'status', 'createdAt'];

/**
 * Validate query parameters for GET /api/payments
 */
export const validateGetPaymentsQuery = (query = {}) => {
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

  // InvoiceId filter
  if (query.invoiceId !== undefined && query.invoiceId !== '') {
    sanitized.invoiceId = String(query.invoiceId).trim();
  }

  // Status filter
  if (query.status !== undefined && query.status !== '') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_PAYMENT_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
    }
  }

  // paymentMethod / paymentMethodType filter
  const methodParam = query.paymentMethod || query.paymentMethodType;
  if (methodParam !== undefined && methodParam !== '') {
    const methodUpper = methodParam.toUpperCase();
    if (!VALID_PAYMENT_METHOD_TYPES.includes(methodUpper)) {
      errors.push(`paymentMethod must be one of: ${VALID_PAYMENT_METHOD_TYPES.join(', ')}`);
    } else {
      sanitized.paymentMethodType = methodUpper;
    }
  }

  // fromDate
  if (query.fromDate !== undefined && query.fromDate !== '') {
    const from = new Date(query.fromDate);
    if (isNaN(from.getTime())) {
      errors.push('fromDate must be a valid ISO date');
    } else {
      sanitized.fromDate = from;
    }
  }

  // toDate
  if (query.toDate !== undefined && query.toDate !== '') {
    const to = new Date(query.toDate);
    if (isNaN(to.getTime())) {
      errors.push('toDate must be a valid ISO date');
    } else {
      sanitized.toDate = to;
    }
  }

  // Date sequence check
  if (sanitized.fromDate && sanitized.toDate && sanitized.fromDate > sanitized.toDate) {
    errors.push('fromDate cannot be after toDate');
  }

  // SortBy
  if (query.sortBy !== undefined && query.sortBy !== '') {
    if (!ALLOWED_SORT_FIELDS.includes(query.sortBy)) {
      errors.push(`sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}`);
    } else {
      sanitized.sortBy = query.sortBy;
    }
  } else {
    sanitized.sortBy = 'transactionDate';
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
 * Validate body for POST /api/payments
 * Rule 3: Do not trust a client-provided status of PAID.
 * A payment must only become PAID through a valid settlement flow.
 */
export const validateCreatePayment = (data = {}) => {
  const errors = [];

  // Security check: Never allow raw card numbers, CVVs, or credentials
  if (data.cardNumber || data.card_number || data.number || data.cvv || data.cvc) {
    errors.push('Raw card numbers and CVVs are strictly prohibited.');
  }

  // memberId
  if (!data.memberId || typeof data.memberId !== 'string' || !data.memberId.trim()) {
    errors.push('memberId is required and must be a non-empty string');
  }

  // invoiceId (optional)
  if (data.invoiceId !== undefined && data.invoiceId !== null && (typeof data.invoiceId !== 'string' || !data.invoiceId.trim())) {
    errors.push('invoiceId must be a valid string if provided');
  }

  // membershipId (optional)
  if (data.membershipId !== undefined && data.membershipId !== null && (typeof data.membershipId !== 'string' || !data.membershipId.trim())) {
    errors.push('membershipId must be a valid string if provided');
  }

  // paymentMethodId (optional)
  if (data.paymentMethodId !== undefined && data.paymentMethodId !== null && (typeof data.paymentMethodId !== 'string' || !data.paymentMethodId.trim())) {
    errors.push('paymentMethodId must be a valid string if provided');
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

  // currency (optional, defaults to USD)
  if (data.currency !== undefined && (typeof data.currency !== 'string' || data.currency.trim().length !== 3)) {
    errors.push('currency must be a 3-letter ISO code (e.g. USD)');
  }

  // paymentMethodType (optional, defaults to CARD)
  if (data.paymentMethodType !== undefined) {
    const methodUpper = String(data.paymentMethodType).toUpperCase();
    if (!VALID_PAYMENT_METHOD_TYPES.includes(methodUpper)) {
      errors.push(`paymentMethodType must be one of: ${VALID_PAYMENT_METHOD_TYPES.join(', ')}`);
    }
  }

  // Status check: Direct creation of PAID payments is prohibited to protect ledger integrity.
  if (data.status !== undefined && data.status !== null) {
    const statusUpper = String(data.status).toUpperCase();
    if (statusUpper === 'PAID') {
      errors.push('Direct creation of PAID status is not permitted. Create payment as PENDING and settle via /api/payments/manual-settle.');
    } else if (!['PENDING', 'FAILED'].includes(statusUpper)) {
      errors.push("Initial payment status must be 'PENDING' or 'FAILED'");
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for POST /api/payments/manual-settle
 */
export const validateManualSettle = (data = {}) => {
  const errors = [];

  if (!data.paymentId || typeof data.paymentId !== 'string' || !data.paymentId.trim()) {
    errors.push('paymentId is required and must be a valid string');
  }

  if (data.settlementReference !== undefined && typeof data.settlementReference !== 'string') {
    errors.push('settlementReference must be a string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for POST /api/payments/:id/refund
 */
export const validateRefund = (data = {}) => {
  const errors = [];

  if (data.reason !== undefined && typeof data.reason !== 'string') {
    errors.push('reason must be a string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
