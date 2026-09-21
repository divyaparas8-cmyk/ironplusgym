const VALID_MEMBER_STATUSES = ['ACTIVE', 'OVERDUE', 'EXPIRED', 'PAUSED'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'memberId', 'status'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate query parameters for GET /api/members
 */
export const validateGetMembersQuery = (query = {}) => {
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
    if (!VALID_MEMBER_STATUSES.includes(statusUpper)) {
      errors.push(`Status must be one of: ${VALID_MEMBER_STATUSES.join(', ')}`);
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
      errors.push("sortOrder must be either 'asc' or 'desc'");
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
 * Validate body for POST /api/members
 */
export const validateCreateMember = (data = {}) => {
  const errors = [];

  // firstName
  if (!data.firstName || typeof data.firstName !== 'string' || data.firstName.trim().length === 0) {
    errors.push('First name is required');
  } else if (data.firstName.trim().length > 100) {
    errors.push('First name cannot exceed 100 characters');
  }

  // lastName
  if (!data.lastName || typeof data.lastName !== 'string' || data.lastName.trim().length === 0) {
    errors.push('Last name is required');
  } else if (data.lastName.trim().length > 100) {
    errors.push('Last name cannot exceed 100 characters');
  }

  // email
  if (!data.email || typeof data.email !== 'string' || data.email.trim().length === 0) {
    errors.push('Email is required');
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.push('A valid email address is required');
  }

  // phone (optional)
  if (data.phone !== undefined && data.phone !== null && data.phone !== '') {
    if (typeof data.phone !== 'string' || data.phone.trim().length > 30) {
      errors.push('Phone must be a valid string up to 30 characters');
    }
  }

  // dob (optional)
  if (data.dob !== undefined && data.dob !== null && data.dob !== '') {
    const parsedDate = new Date(data.dob);
    if (isNaN(parsedDate.getTime())) {
      errors.push('Date of birth (dob) must be a valid ISO date');
    }
  }

  // status (optional, defaults to ACTIVE)
  if (data.status !== undefined && data.status !== null) {
    if (!VALID_MEMBER_STATUSES.includes(data.status)) {
      errors.push(`Status must be one of: ${VALID_MEMBER_STATUSES.join(', ')}`);
    }
  }

  // avatar (optional - supports URL or base64 data URL)
  if (data.avatar !== undefined && data.avatar !== null && data.avatar !== '') {
    if (typeof data.avatar !== 'string') {
      errors.push('Avatar must be a valid string');
    }
  }

  // emergencyContact (optional)
  if (data.emergencyContact !== undefined && data.emergencyContact !== null) {
    if (typeof data.emergencyContact !== 'string' || data.emergencyContact.trim().length > 255) {
      errors.push('Emergency contact must be a string up to 255 characters');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PUT /api/members/:id
 */
export const validateUpdateMember = (data = {}) => {
  const errors = [];

  const allowedFields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'avatar',
    'dob',
    'emergencyContact',
    'notes',
    'status'
  ];

  const providedFields = Object.keys(data).filter(key => allowedFields.includes(key));

  if (providedFields.length === 0) {
    errors.push('At least one valid field must be provided for update');
  }

  if (data.firstName !== undefined) {
    if (typeof data.firstName !== 'string' || data.firstName.trim().length === 0) {
      errors.push('First name cannot be empty');
    } else if (data.firstName.trim().length > 100) {
      errors.push('First name cannot exceed 100 characters');
    }
  }

  if (data.lastName !== undefined) {
    if (typeof data.lastName !== 'string' || data.lastName.trim().length === 0) {
      errors.push('Last name cannot be empty');
    } else if (data.lastName.trim().length > 100) {
      errors.push('Last name cannot exceed 100 characters');
    }
  }

  if (data.email !== undefined) {
    if (typeof data.email !== 'string' || !EMAIL_REGEX.test(data.email.trim())) {
      errors.push('A valid email address is required');
    }
  }

  if (data.phone !== undefined && data.phone !== null && data.phone !== '') {
    if (typeof data.phone !== 'string' || data.phone.trim().length > 30) {
      errors.push('Phone must be a valid string up to 30 characters');
    }
  }

  if (data.dob !== undefined && data.dob !== null && data.dob !== '') {
    const parsedDate = new Date(data.dob);
    if (isNaN(parsedDate.getTime())) {
      errors.push('Date of birth (dob) must be a valid date');
    }
  }

  if (data.status !== undefined) {
    if (!VALID_MEMBER_STATUSES.includes(data.status)) {
      errors.push(`Status must be one of: ${VALID_MEMBER_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate body for PATCH /api/members/:id/status
 */
export const validateUpdateStatus = (data = {}) => {
  const errors = [];

  if (!data.status || typeof data.status !== 'string') {
    errors.push('Status is required');
  } else if (!VALID_MEMBER_STATUSES.includes(data.status)) {
    errors.push(`Status must be one of: ${VALID_MEMBER_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
