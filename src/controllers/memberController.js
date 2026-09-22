import MemberService from '../services/memberService.js';
import {
  validateGetMembersQuery,
  validateCreateMember,
  validateUpdateMember,
  validateUpdateStatus
} from '../validators/memberValidator.js';

/**
 * Handle GET /api/members
 */
export const getMembers = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetMembersQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await MemberService.getMembers({
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
 * Handle GET /api/members/:id
 */
export const getMemberById = async (req, res) => {
  try {
    const member = await MemberService.getMemberById({
      gymId: req.user.gymId,
      memberId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: member
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
 * Handle POST /api/members
 */
export const createMember = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateMember(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await MemberService.createMember({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Member created successfully',
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
 * Handle POST /api/members/enroll (Composite enrollment flow)
 */
export const enrollMember = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateMember(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await MemberService.enrollMember({
      gymId: req.user.gymId,
      userId: req.user.userId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Member enrolled successfully with all initial records',
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
 * Handle PUT /api/members/:id
 */
export const updateMember = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateMember(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MemberService.updateMember({
      gymId: req.user.gymId,
      memberId: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Member updated successfully',
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
 * Handle PATCH /api/members/:id/status
 */
export const updateMemberStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await MemberService.updateMemberStatus({
      gymId: req.user.gymId,
      memberId: req.params.id,
      status: req.body.status
    });

    return res.status(200).json({
      success: true,
      message: 'Member status updated successfully',
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
 * Handle DELETE /api/members/:id
 */
export const deleteMember = async (req, res) => {
  try {
    const result = await MemberService.deleteMember({
      gymId: req.user.gymId,
      memberId: req.params.id
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
