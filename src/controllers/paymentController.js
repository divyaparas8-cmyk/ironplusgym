import PaymentService from '../services/paymentService.js';
import auditLogService from '../services/auditLogService.js';
import paymentGateway from '../services/paymentGateway/paymentGateway.js';
import {
  validateGetPaymentsQuery,
  validateCreatePayment,
  validateManualSettle,
  validateRefund,
  validateRecordMemberPayment
} from '../validators/paymentValidator.js';

/**
 * Handle GET /api/payments
 */
export const getPayments = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetPaymentsQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await PaymentService.getPayments({
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
 * Handle GET /api/payments/:id
 */
export const getPaymentById = async (req, res) => {
  try {
    const payment = await PaymentService.getPaymentById({
      gymId: req.user.gymId,
      paymentId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: payment
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
 * Handle POST /api/payments
 */
export const createPayment = async (req, res) => {
  try {
    const { isValid, errors } = validateCreatePayment(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await PaymentService.createPayment({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
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
 * Handle POST /api/payments/manual-settle
 */
export const manualSettle = async (req, res) => {
  try {
    const { isValid, errors } = validateManualSettle(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const settled = await PaymentService.manualSettle({
      gymId: req.user.gymId,
      paymentId: req.body.paymentId,
      settlementReference: req.body.settlementReference,
      notes: req.body.notes
    });

    auditLogService.logAction(req.user.gymId, {
      userId: req.user.userId,
      action: 'PAYMENT_MANUALLY_SETTLED',
      entity: 'Payment',
      entityId: req.body.paymentId,
      metadata: { reference: req.body.settlementReference }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Payment settled successfully',
      data: settled
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
 * Handle POST /api/payments/:id/refund
 */
export const refundPayment = async (req, res) => {
  try {
    const { isValid, errors } = validateRefund(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const refunded = await PaymentService.refundPayment({
      gymId: req.user.gymId,
      paymentId: req.params.id,
      reason: req.body.reason
    });

    auditLogService.logAction(req.user.gymId, {
      userId: req.user.userId,
      action: 'PAYMENT_REFUNDED',
      entity: 'Payment',
      entityId: req.params.id,
      metadata: { reason: req.body.reason }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
      data: refunded
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
 * Handle GET /api/payments/config - Get gateway publishable configuration
 */
export const getPaymentConfig = async (req, res) => {
  try {
    const config = paymentGateway.getPublishableConfig();
    return res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get payment configuration'
    });
  }
};

/**
 * Handle POST /api/payments/create-intent - Create PaymentIntent for client-side confirmation
 */
export const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency, description } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid positive payment amount is required'
      });
    }

    const result = await paymentGateway.createPaymentIntent({
      amount: Number(amount),
      currency: currency || 'USD',
      description,
      metadata: {
        gymId: req.user.gymId,
        userId: req.user.userId
      }
    });

    if (!result.configured) {
      return res.status(200).json({
        success: false,
        configured: false,
        status: 'CONFIGURATION_REQUIRED',
        message: result.error
      });
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to create payment intent'
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

/**
 * Handle POST /api/payments/record - Direct Member Cash or QR Payment
 */
export const recordMemberPayment = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateRecordMemberPayment(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const payment = await PaymentService.recordMemberPayment({
      gymId: req.user.gymId,
      userId: req.user.userId,
      ...sanitized
    });

    return res.status(201).json({
      success: true,
      message: `${sanitized.paymentMethodType === 'QR' ? 'QR' : 'Cash'} payment recorded successfully`,
      data: payment
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

