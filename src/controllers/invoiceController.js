import InvoiceService from '../services/invoiceService.js';
import {
  validateGetInvoicesQuery,
  validateCreateInvoice,
  validateUpdateInvoice,
  validateUpdateInvoiceStatus
} from '../validators/invoiceValidator.js';

/**
 * Handle GET /api/invoices
 */
export const getInvoices = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetInvoicesQuery(req.query);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const result = await InvoiceService.getInvoices({
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
 * Handle GET /api/invoices/:id
 */
export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await InvoiceService.getInvoiceById({
      gymId: req.user.gymId,
      invoiceId: req.params.id
    });

    return res.status(200).json({
      success: true,
      data: invoice
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
 * Handle POST /api/invoices
 */
export const createInvoice = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateInvoice(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await InvoiceService.createInvoice({
      gymId: req.user.gymId,
      data: req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
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
 * Handle PUT /api/invoices/:id
 */
export const updateInvoice = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateInvoice(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await InvoiceService.updateInvoice({
      gymId: req.user.gymId,
      invoiceId: req.params.id,
      data: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
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
 * Handle PATCH /api/invoices/:id/status
 */
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateInvoiceStatus(req.body);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const updated = await InvoiceService.updateInvoiceStatus({
      gymId: req.user.gymId,
      invoiceId: req.params.id,
      status: req.body.status
    });

    return res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
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
