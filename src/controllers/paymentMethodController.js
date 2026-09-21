import PaymentMethodService from '../services/paymentMethodService.js';
import {
  validateGetPaymentMethodsQuery,
  validateCreatePaymentMethod,
  validateUpdatePaymentMethod,
  validateUpdatePaymentMethodStatus
} from '../validators/paymentMethodValidator.js';

/**
 * Handle GET /api/payment-methods
 */
export const getPaymentMethods = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetPaymentMethodsQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await PaymentMethodService.getPaymentMethods({
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
 * Handle GET /api/payment-methods/:id
 */
export const getPaymentMethodById = async (req, res) => {
  try {
    const paymentMethod = await PaymentMethodService.getPaymentMethodById({
      gymId: req.user.gymId,
      paymentMethodId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: paymentMethod
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
 * Handle POST /api/payment-methods
 */
export const createPaymentMethod = async (req, res) => {
  try {
    const { isValid, errors } = validateCreatePaymentMethod(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await PaymentMethodService.createPaymentMethod({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Payment method created successfully',
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
 * Handle PUT /api/payment-methods/:id
 */
export const updatePaymentMethod = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdatePaymentMethod(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await PaymentMethodService.updatePaymentMethod({
      gymId: req.user.gymId,
      paymentMethodId: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Payment method updated successfully',
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
 * Handle PATCH /api/payment-methods/:id/status
 */
export const updatePaymentMethodStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdatePaymentMethodStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await PaymentMethodService.updatePaymentMethodStatus({
      gymId: req.user.gymId,
      paymentMethodId: req.params.id,
      status: req.body.status
    });

    return res.status(200).json({
      success: true,
      message: 'Payment method status updated successfully',
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
 * Handle DELETE /api/payment-methods/:id
 */
export const deletePaymentMethod = async (req, res) => {
  try {
    const result = await PaymentMethodService.deletePaymentMethod({
      gymId: req.user.gymId,
      paymentMethodId: req.params.id
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
