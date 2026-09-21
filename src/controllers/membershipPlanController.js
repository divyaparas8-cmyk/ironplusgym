import MembershipPlanService from '../services/membershipPlanService.js';
import {
  validateGetPlansQuery,
  validateCreatePlan,
  validateUpdatePlan,
  validateUpdatePlanStatus
} from '../validators/membershipPlanValidator.js';

/**
 * Handle GET /api/plans
 */
export const getPlans = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetPlansQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await MembershipPlanService.getPlans({
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
 * Handle GET /api/plans/:id
 */
export const getPlanById = async (req, res) => {
  try {
    const plan = await MembershipPlanService.getPlanById({
      gymId: req.user.gymId,
      planId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: plan
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
 * Handle POST /api/plans
 */
export const createPlan = async (req, res) => {
  try {
    const { isValid, errors } = validateCreatePlan(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await MembershipPlanService.createPlan({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Membership plan created successfully',
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
 * Handle PUT /api/plans/:id
 */
export const updatePlan = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdatePlan(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MembershipPlanService.updatePlan({
      gymId: req.user.gymId,
      planId: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Membership plan updated successfully',
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
 * Handle PATCH /api/plans/:id/status
 */
export const updatePlanStatus = async (req, res) => {
  try {
    const { isValid, errors, isActive } = validateUpdatePlanStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MembershipPlanService.updatePlanStatus({
      gymId: req.user.gymId,
      planId: req.params.id,
      isActive
    });

    return res.status(200).json({
      success: true,
      message: 'Plan status updated successfully',
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
 * Handle DELETE /api/plans/:id
 */
export const deletePlan = async (req, res) => {
  try {
    const result = await MembershipPlanService.deletePlan({
      gymId: req.user.gymId,
      planId: req.params.id
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
