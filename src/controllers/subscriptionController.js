import GymSubscriptionService from '../services/gymSubscriptionService.js';
import paymentGateway from '../services/paymentGateway/paymentGateway.js';

export const getCurrentSubscription = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    if (!gymId) {
      return res.status(400).json({ success: false, message: 'Tenant Gym ID required' });
    }

    const subscription = await GymSubscriptionService.getGymSubscription(gymId);
    const accessCheck = await GymSubscriptionService.isGymAccessAllowed(gymId);

    return res.status(200).json({
      success: true,
      data: {
        ...subscription,
        accessAllowed: accessCheck.allowed,
        accessStatus: accessCheck.status,
        isGracePeriod: Boolean(accessCheck.isGracePeriod),
        daysRemaining: subscription.currentPeriodEnd
          ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24)))
          : 0
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch gym subscription'
    });
  }
};

export const getPlans = async (req, res) => {
  try {
    const plans = await GymSubscriptionService.getAvailablePlans();
    return res.status(200).json({
      success: true,
      data: plans
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription plans'
    });
  }
};

export const changePlan = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { planId, billingInterval } = req.body;

    if (!planId) {
      return res.status(400).json({ success: false, message: 'planId is required' });
    }

    const updated = await GymSubscriptionService.changePlan(gymId, planId, billingInterval);
    return res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to change subscription plan'
    });
  }
};

export const renewSubscription = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { planId, billingInterval, months, paymentMethodId } = req.body;

    // Execute renewal & ledger synchronization
    const result = await GymSubscriptionService.renewSubscription(gymId, {
      planId,
      billingInterval,
      months,
      paymentDetails: {
        paymentMethod: paymentMethodId ? 'CARD' : 'MANUAL',
        stripePaymentIntentId: paymentMethodId ? `pi_sub_${Date.now()}` : null
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription renewed successfully. Full platform access is active.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to renew subscription'
    });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { immediate, reason } = req.body || {};

    const updated = await GymSubscriptionService.cancelSubscription(gymId, {
      immediate: Boolean(immediate),
      reason
    });

    return res.status(200).json({
      success: true,
      message: immediate
        ? 'Subscription has been cancelled immediately.'
        : 'Subscription set to cancel at the end of the current billing cycle.',
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to cancel subscription'
    });
  }
};

export const reactivateSubscription = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const updated = await GymSubscriptionService.reactivateSubscription(gymId);

    return res.status(200).json({
      success: true,
      message: 'Subscription reactivated successfully.',
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reactivate subscription'
    });
  }
};

export const getHistory = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const invoices = await GymSubscriptionService.getSubscriptionInvoices(gymId);

    return res.status(200).json({
      success: true,
      data: invoices
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription history'
    });
  }
};

export default {
  getCurrentSubscription,
  getPlans,
  changePlan,
  renewSubscription,
  cancelSubscription,
  reactivateSubscription,
  getHistory
};
