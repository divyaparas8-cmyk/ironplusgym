import RecurringBillingService from '../services/recurringBillingService.js';
import {
  validateGetRecurringBillingsQuery,
  validateCreateRecurringBilling,
  validateUpdateRecurringBilling,
  validateUpdateRecurringBillingStatus
} from '../validators/recurringBillingValidator.js';

/**
 * Handle GET /api/recurring-billing
 */
export const getRecurringBillings = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetRecurringBillingsQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await RecurringBillingService.getRecurringBillings({
      gymId: req.user.gymId,
      ...sanitized
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle GET /api/recurring-billing/:id
 */
export const getRecurringBillingById = async (req, res) => {
  try {
    const recurring = await RecurringBillingService.getRecurringBillingById({
      gymId: req.user.gymId,
      id: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: recurring
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle POST /api/recurring-billing
 */
export const createRecurringBilling = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateRecurringBilling(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await RecurringBillingService.createRecurringBilling({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Recurring billing configured successfully',
      data: created
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle PUT /api/recurring-billing/:id
 */
export const updateRecurringBilling = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateRecurringBilling(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await RecurringBillingService.updateRecurringBilling({
      gymId: req.user.gymId,
      id: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Recurring billing updated successfully',
      data: updated
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle PATCH /api/recurring-billing/:id/status
 */
export const updateStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateRecurringBillingStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await RecurringBillingService.updateStatus({
      gymId: req.user.gymId,
      id: req.params.id,
      status: req.body.status
    });

    return res.status(200).json({
      success: true,
      message: 'Recurring billing status updated successfully',
      data: updated
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle PATCH /api/recurring-billing/:id/pause
 */
export const pauseRecurringBilling = async (req, res) => {
  try {
    const paused = await RecurringBillingService.pauseRecurringBilling({
      gymId: req.user.gymId,
      id: req.params.id
    });

    return res.status(200).json({
      success: true,
      message: 'Recurring billing paused successfully',
      data: paused
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle PATCH /api/recurring-billing/:id/resume
 */
export const resumeRecurringBilling = async (req, res) => {
  try {
    const resumed = await RecurringBillingService.resumeRecurringBilling({
      gymId: req.user.gymId,
      id: req.params.id
    });

    return res.status(200).json({
      success: true,
      message: 'Recurring billing resumed successfully',
      data: resumed
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle DELETE /api/recurring-billing/:id
 */
export const deleteRecurringBilling = async (req, res) => {
  try {
    const result = await RecurringBillingService.deleteRecurringBilling({
      gymId: req.user.gymId,
      id: req.params.id
    });

    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle POST /api/recurring-billing/process-due
 */
export const processDueRecurringBilling = async (req, res) => {
  try {
    const results = await RecurringBillingService.processDueRecurringBilling({
      gymId: req.user.gymId
    });

    return res.status(200).json({
      success: true,
      message: `Processed ${results.processed} due schedules (${results.skipped} skipped)`,
      data: results
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};
