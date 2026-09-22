import AuthService from '../services/authService.js';
import prisma from '../prisma.js';
import auditLogService from '../services/auditLogService.js';

/**
 * Handle POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await AuthService.login({ email, password });

    auditLogService.logAction(result.user.gymId, {
      userId: result.user.id,
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: result.user.id
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      token: result.token,
      data: result.user
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
 * Handle POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { gymName, ownerName, email, password } = req.body || {};
    const result = await AuthService.register({ gymName, ownerName, email, password });

    return res.status(201).json({
      success: true,
      message: 'Gym registered successfully',
      token: result.token,
      data: result.user
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
 * Handle GET /api/auth/me
 */
export const getCurrentUser = async (req, res) => {
  try {
    const { userId, gymId } = req.user;
    const user = await AuthService.getCurrentUser(userId, gymId);

    return res.status(200).json({
      success: true,
      data: user
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
 * Handle PUT /api/auth/gym - Update Gym Profile Settings
 */
export const updateGymSettings = async (req, res) => {
  try {
    const { gymId } = req.user;
    const {
      name,
      legalName,
      contactEmail,
      email,
      phone,
      address,
      city,
      state,
      postalCode,
      country,
      timezone,
      currency,
      logo,
      website
    } = req.body || {};

    const updatedGym = await prisma.gym.update({
      where: { id: gymId },
      data: {
        legalName: legalName !== undefined ? legalName.trim() : undefined,
        tradeName: name !== undefined ? name.trim() : undefined,
        contactEmail: (contactEmail || email) !== undefined ? (contactEmail || email).trim() : undefined,
        phone: phone !== undefined ? phone : undefined,
        address: address !== undefined ? address : undefined,
        city: city !== undefined ? city : undefined,
        state: state !== undefined ? state : undefined,
        postalCode: postalCode !== undefined ? postalCode : undefined,
        country: country !== undefined ? country : undefined,
        timezone: timezone !== undefined ? timezone : undefined,
        currency: currency !== undefined ? currency : undefined,
        logoUrl: logo !== undefined ? logo : undefined,
        website: website !== undefined ? website : undefined
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Gym profile updated successfully',
      data: updatedGym
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Failed to update gym profile' : error.message;

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Handle POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const result = await AuthService.requestPasswordReset(email);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process password reset request'
    });
  }
};

/**
 * Handle POST /api/auth/reset-password
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body || {};
    const result = await AuthService.resetPassword({ token, email, newPassword });
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to reset password'
    });
  }
};


