const VALID_INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'VOID'];
const ALLOWED_SORT_FIELDS = ['dueDate', 'createdAt', 'total', 'subtotal', 'status', 'invoiceNumber'];

export const ALLOWED_INVOICE_STATUS_TRANSITIONS = {
  DRAFT: ['OPEN', 'VOID'],
  OPEN: ['PAID', 'OVERDUE', 'VOID'],
  OVERDUE: ['PAID', 'VOID'],
  PAID: [], // Settled historical invoice cannot be reopened or reverted to draft
  VOID: []  // Voided record is strictly terminal
};

/**
 * Validate query parameters for GET /api/invoices
 */
export const validateGetInvoicesQuery = (query = {}) => {
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

  // Search (e.g. invoiceNumber)
  if (query.search !== undefined && query.search !== '') {
    sanitized.search = String(query.search).trim();
  }

  // MemberId filter
  if (query.memberId !== undefined && query.memberId !== '') {
    sanitized.memberId = String(query.memberId).trim();
  }

  // Status filter
  if (query.status !== undefined && query.status !== '') {
    const statusUpper = query.status.toUpperCase();
    if (!VALID_INVOICE_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_INVOICE_STATUSES.join(', ')}`);
    } else {
      sanitized.status = statusUpper;
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
    sanitized.sortBy = 'dueDate';
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
 * Validate body for POST /api/invoices
 */
export const validateCreateInvoice = (data = {}) => {
  const errors = [];

  // memberId
  if (!data.memberId || typeof data.memberId !== 'string' || !data.memberId.trim()) {
    errors.push('memberId is required and must be a non-empty string');
  }

  // membershipId (optional)
  if (data.membershipId !== undefined && data.membershipId !== null && (typeof data.membershipId !== 'string' || !data.membershipId.trim())) {
    errors.push('membershipId must be a valid string if provided');
  }

  // invoiceNumber (optional, backend can auto-generate if omitted)
  if (data.invoiceNumber !== undefined && data.invoiceNumber !== null) {
    if (typeof data.invoiceNumber !== 'string' || !data.invoiceNumber.trim()) {
      errors.push('invoiceNumber must be a non-empty string if provided');
    }
  }

  // subtotal
  if (data.subtotal === undefined || data.subtotal === null) {
    errors.push('subtotal is required');
  } else {
    const subtotalNum = Number(data.subtotal);
    if (isNaN(subtotalNum) || subtotalNum <= 0) {
      errors.push('subtotal must be a positive number greater than 0');
    }
  }

  // tax (optional, defaults to 0.00)
  let taxNum = 0.00;
  if (data.tax !== undefined && data.tax !== null) {
    taxNum = Number(data.tax);
    if (isNaN(taxNum) || taxNum < 0) {
      errors.push('tax must be a non-negative number');
    }
  }

  // total
  if (data.total === undefined || data.total === null) {
    errors.push('total is required');
  } else {
    const totalNum = Number(data.total);
    if (isNaN(totalNum) || totalNum <= 0) {
      errors.push('total must be a positive number greater than 0');
    }

    // Exact financial consistency check: subtotal + tax === total
    if (data.subtotal !== undefined && !isNaN(Number(data.subtotal)) && !isNaN(taxNum)) {
      const expectedTotal = Math.round((Number(data.subtotal) + taxNum) * 100) / 100;
      const actualTotal = Math.round(totalNum * 100) / 100;
      if (Math.abs(expectedTotal - actualTotal) > 0.001) {
        errors.push(`Inconsistent financial calculation: subtotal (${data.subtotal}) + tax (${taxNum}) does not equal total (${data.total})`);
      }
    }
  }

  // dueDate
  if (!data.dueDate) {
    errors.push('dueDate is required');
  } else {
    const due = new Date(data.dueDate);
    if (isNaN(due.getTime())) {
      errors.push('dueDate must be a valid ISO date');
    }
  }

  // status (optional, defaults to OPEN)
  if (data.status !== undefined && data.status !== null) {
    const statusUpper = String(data.status).toUpperCase();
    if (!VALID_INVOICE_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_INVOICE_STATUSES.join(', ')}`);
    }
  }

  // notes (optional)
  if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string') {
    errors.push('notes must be a string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/invoices/:id
 */
export const validateUpdateInvoice = (data = {}) => {
  const errors = [];

  // Check forbidden fields
  if (data.id !== undefined) {
    errors.push('Invoice ID cannot be modified');
  }
  if (data.gymId !== undefined) {
    errors.push('Gym assignment cannot be modified');
  }
  if (data.memberId !== undefined) {
    errors.push('Member assignment cannot be modified');
  }
  if (data.invoiceNumber !== undefined) {
    errors.push('Invoice number cannot be modified');
  }

  // dueDate
  if (data.dueDate !== undefined) {
    const due = new Date(data.dueDate);
    if (isNaN(due.getTime())) {
      errors.push('dueDate must be a valid ISO date');
    }
  }

  // subtotal / tax / total financial check if supplied
  if (data.subtotal !== undefined || data.total !== undefined || data.tax !== undefined) {
    if (data.subtotal !== undefined && (isNaN(Number(data.subtotal)) || Number(data.subtotal) <= 0)) {
      errors.push('subtotal must be a positive number greater than 0');
    }
    if (data.tax !== undefined && (isNaN(Number(data.tax)) || Number(data.tax) < 0)) {
      errors.push('tax must be a non-negative number');
    }
    if (data.total !== undefined && (isNaN(Number(data.total)) || Number(data.total) <= 0)) {
      errors.push('total must be a positive number greater than 0');
    }
  }

  // notes
  if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string') {
    errors.push('notes must be a string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/invoices/:id/status
 */
export const validateUpdateInvoiceStatus = (data = {}) => {
  const errors = [];

  if (!data.status) {
    errors.push('status is required');
  } else {
    const statusUpper = String(data.status).toUpperCase();
    if (!VALID_INVOICE_STATUSES.includes(statusUpper)) {
      errors.push(`status must be one of: ${VALID_INVOICE_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
