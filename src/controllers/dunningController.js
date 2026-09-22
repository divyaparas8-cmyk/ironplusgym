import DunningService from '../services/dunningService.js';
import prisma from '../prisma.js';

export const getDunningOverview = async (req, res) => {
  try {
    const overview = await DunningService.getDunningOverview({
      gymId: req.user.gymId
    });

    return res.status(200).json({ success: true, data: overview });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const evaluatePaymentDunning = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { failureReason } = req.body;

    const result = await DunningService.evaluateFailedPayment({
      gymId: req.user.gymId,
      paymentId,
      failureReason
    });

    return res.status(200).json({
      success: true,
      message: 'Dunning evaluated successfully',
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const processAllFailedPayments = async (req, res) => {
  try {
    const gymId = req.user.gymId;

    // Find all failed payments for this gym that don't have exhausted dunning
    const failedPayments = await prisma.payment.findMany({
      where: {
        gymId,
        status: 'FAILED'
      }
    });

    const evaluations = [];
    for (const payment of failedPayments) {
      try {
        const evalResult = await DunningService.evaluateFailedPayment({
          gymId,
          paymentId: payment.id,
          failureReason: payment.failureReason || 'Automated dunning processor check'
        });
        evaluations.push({ paymentId: payment.id, ...evalResult });
      } catch (err) {
        evaluations.push({ paymentId: payment.id, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Evaluated ${evaluations.length} failed payments`,
      data: evaluations
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const batchUpcomingReminders = async (req, res) => {
  try {
    const result = await DunningService.processUpcomingPaymentReminders({
      gymId: req.user.gymId
    });
    return res.status(200).json({
      success: true,
      message: `Batch processed upcoming reminders: ${result.processedCount} created`,
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const batchOverdueReminders = async (req, res) => {
  try {
    const result = await DunningService.processOverduePaymentReminders({
      gymId: req.user.gymId
    });
    return res.status(200).json({
      success: true,
      message: `Batch processed overdue reminders: ${result.processedCount} created`,
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const batchExpiryReminders = async (req, res) => {
  try {
    const result = await DunningService.processMembershipExpiryReminders({
      gymId: req.user.gymId
    });
    return res.status(200).json({
      success: true,
      message: `Batch processed membership expiry reminders: ${result.processedCount} created`,
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const executeRetry = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await DunningService.executeRetryAttempt({
      gymId: req.user.gymId,
      paymentId
    });
    return res.status(200).json({
      success: result.success,
      message: result.success ? 'Dunning retry succeeded and restored account.' : 'Dunning retry attempted.',
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

