export const validateCreatePlan = (body = {}) => {
  const errors = [];
  const { name, monthlyPrice, yearlyPrice, trialDays, gracePeriodDays, currency } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Plan name is required and must be a non-empty string');
  }

  if (monthlyPrice === undefined || isNaN(Number(monthlyPrice)) || Number(monthlyPrice) < 0) {
    errors.push('monthlyPrice is required and must be a non-negative number');
  }

  if (yearlyPrice !== undefined && yearlyPrice !== null && (isNaN(Number(yearlyPrice)) || Number(yearlyPrice) < 0)) {
    errors.push('yearlyPrice must be a non-negative number');
  }

  if (trialDays !== undefined && (isNaN(Number(trialDays)) || Number(trialDays) < 0)) {
    errors.push('trialDays must be a non-negative integer');
  }

  if (gracePeriodDays !== undefined && (isNaN(Number(gracePeriodDays)) || Number(gracePeriodDays) < 0)) {
    errors.push('gracePeriodDays must be a non-negative integer');
  }

  if (currency && typeof currency !== 'string') {
    errors.push('currency must be a valid currency string code (e.g. USD)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateUpdatePlan = (body = {}) => {
  const errors = [];
  const { name, monthlyPrice, yearlyPrice, trialDays, gracePeriodDays } = body;

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    errors.push('Plan name must be a non-empty string');
  }

  if (monthlyPrice !== undefined && (isNaN(Number(monthlyPrice)) || Number(monthlyPrice) < 0)) {
    errors.push('monthlyPrice must be a non-negative number');
  }

  if (yearlyPrice !== undefined && yearlyPrice !== null && (isNaN(Number(yearlyPrice)) || Number(yearlyPrice) < 0)) {
    errors.push('yearlyPrice must be a non-negative number');
  }

  if (trialDays !== undefined && (isNaN(Number(trialDays)) || Number(trialDays) < 0)) {
    errors.push('trialDays must be a non-negative integer');
  }

  if (gracePeriodDays !== undefined && (isNaN(Number(gracePeriodDays)) || Number(gracePeriodDays) < 0)) {
    errors.push('gracePeriodDays must be a non-negative integer');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateSubscriptionOverride = (body = {}) => {
  const errors = [];
  const validStatuses = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCELLED', 'EXPIRED'];
  const { status, currentPeriodEnd, gracePeriodEnd } = body;

  if (status && !validStatuses.includes(status.toUpperCase())) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  if (currentPeriodEnd && isNaN(Date.parse(currentPeriodEnd))) {
    errors.push('currentPeriodEnd must be a valid ISO date string');
  }

  if (gracePeriodEnd && isNaN(Date.parse(gracePeriodEnd))) {
    errors.push('gracePeriodEnd must be a valid ISO date string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  validateCreatePlan,
  validateUpdatePlan,
  validateSubscriptionOverride
};
