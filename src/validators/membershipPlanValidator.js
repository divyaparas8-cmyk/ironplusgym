const VALID_BILLING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'price', 'billingFrequency', 'isActive'];

/**
 * Validate query parameters for GET /api/plans
 */
export const validateGetPlansQuery = (query = {}) => {
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

  // Status / isActive filter
  if (query.status !== undefined && query.status !== '') {
    const upper = query.status.toUpperCase();
    if (['ACTIVE', 'TRUE', '1'].includes(upper)) {
      sanitized.isActive = true;
    } else if (['INACTIVE', 'FALSE', '0'].includes(upper)) {
      sanitized.isActive = false;
    } else {
      errors.push("Status filter must be 'ACTIVE' or 'INACTIVE'");
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
 * Validate body for POST /api/plans
 */
export const validateCreatePlan = (data = {}) => {
  const errors = [];

  // Name
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Plan name is required');
  } else if (data.name.trim().length > 100) {
    errors.push('Plan name cannot exceed 100 characters');
  }

  // Price
  if (data.price === undefined || data.price === null || data.price === '') {
    errors.push('Price is required');
  } else {
    const numPrice = Number(data.price);
    if (isNaN(numPrice) || numPrice < 0) {
      errors.push('Price must be a valid non-negative number');
    }
  }

  // BillingFrequency
  if (data.billingFrequency !== undefined && data.billingFrequency !== null) {
    if (!VALID_BILLING_FREQUENCIES.includes(data.billingFrequency)) {
      errors.push(`billingFrequency must be one of: ${VALID_BILLING_FREQUENCIES.join(', ')}`);
    }
  }

  // FeatureList
  if (data.featureList !== undefined && data.featureList !== null) {
    if (!Array.isArray(data.featureList)) {
      errors.push('featureList must be an array of strings');
    } else if (data.featureList.some(item => typeof item !== 'string')) {
      errors.push('All items in featureList must be strings');
    }
  }

  // Description
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push('Description must be a string');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/plans/:id
 */
export const validateUpdatePlan = (data = {}) => {
  const errors = [];

  const allowedFields = ['name', 'description', 'price', 'billingFrequency', 'featureList', 'isActive'];
  const provided = Object.keys(data).filter(k => allowedFields.includes(k));

  if (provided.length === 0) {
    errors.push('At least one valid field must be provided for update');
  }

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('Plan name cannot be empty');
    } else if (data.name.trim().length > 100) {
      errors.push('Plan name cannot exceed 100 characters');
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

  if (data.featureList !== undefined && data.featureList !== null) {
    if (!Array.isArray(data.featureList)) {
      errors.push('featureList must be an array of strings');
    } else if (data.featureList.some(item => typeof item !== 'string')) {
      errors.push('All items in featureList must be strings');
    }
  }

  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/plans/:id/status
 */
export const validateUpdatePlanStatus = (data = {}) => {
  const errors = [];
  let isActive = undefined;

  if (data.status !== undefined) {
    const upper = String(data.status).toUpperCase();
    if (['ACTIVE', 'TRUE', '1'].includes(upper)) {
      isActive = true;
    } else if (['INACTIVE', 'FALSE', '0'].includes(upper)) {
      isActive = false;
    } else {
      errors.push("Status must be 'ACTIVE' or 'INACTIVE'");
    }
  } else if (data.isActive !== undefined) {
    if (typeof data.isActive === 'boolean') {
      isActive = data.isActive;
    } else {
      errors.push('isActive must be a boolean');
    }
  } else {
    errors.push("A valid 'status' ('ACTIVE' or 'INACTIVE') or 'isActive' boolean is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
    isActive
  };
};
