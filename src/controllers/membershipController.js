import MembershipService from '../services/membershipService.js';
import {
  validateGetMembershipsQuery,
  validateCreateMembership,
  validateUpdateMembership,
  validateUpdateMembershipStatus
} from '../validators/membershipValidator.js';

/**
 * Handle GET /api/memberships
 */
export const getMemberships = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetMembershipsQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await MembershipService.getMemberships({
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
 * Handle GET /api/memberships/:id
 */
export const getMembershipById = async (req, res) => {
  try {
    const membership = await MembershipService.getMembershipById({
      gymId: req.user.gymId,
      membershipId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: membership
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
 * Handle POST /api/memberships
 */
export const createMembership = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateMembership(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await MembershipService.createMembership({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Membership created successfully',
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
 * Handle PUT /api/memberships/:id
 */
export const updateMembership = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateMembership(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MembershipService.updateMembership({
      gymId: req.user.gymId,
      membershipId: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Membership updated successfully',
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
 * Handle PATCH /api/memberships/:id/status
 */
export const updateMembershipStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateMembershipStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MembershipService.updateMembershipStatus({
      gymId: req.user.gymId,
      membershipId: req.params.id,
      status: req.body.status
    });

    return res.status(200).json({
      success: true,
      message: 'Membership status updated successfully',
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
 * Handle DELETE /api/memberships/:id
 */
export const deleteMembership = async (req, res) => {
  try {
    const result = await MembershipService.deleteMembership({
      gymId: req.user.gymId,
      membershipId: req.params.id
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
