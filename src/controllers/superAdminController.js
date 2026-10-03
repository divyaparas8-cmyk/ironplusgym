import SuperAdminService from '../services/superAdminService.js';
import { validateCreatePlan, validateUpdatePlan, validateSubscriptionOverride } from '../validators/subscriptionValidator.js';

export const getDashboard = async (req, res) => {
  try {
    const metrics = await SuperAdminService.getDashboardMetrics();
    return res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch super admin dashboard metrics'
    });
  }
};

export const getGyms = async (req, res) => {
  try {
    const { search, status, page, limit } = req.query;
    const result = await SuperAdminService.listGyms({ search, status, page, limit });
    return res.status(200).json({
      success: true,
      data: result.gyms,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list gyms'
    });
  }
};

export const getGymById = async (req, res) => {
  try {
    const { id } = req.params;
    const gym = await SuperAdminService.getGymDetails(id);
    return res.status(200).json({
      success: true,
      data: gym
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch gym details'
    });
  }
};

export const updateGymSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { isValid, errors } = validateSubscriptionOverride(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, errors });
    }

    const updated = await SuperAdminService.updateGymSubscription(id, {
      ...req.body,
      adminUserId: req.user.userId
    });

    return res.status(200).json({
      success: true,
      message: 'Gym subscription updated successfully',
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update gym subscription'
    });
  }
};

export const getSubscriptions = async (req, res) => {
  try {
    const { status, search, page, limit } = req.query;
    const result = await SuperAdminService.listSubscriptions({ status, search, page, limit });
    return res.status(200).json({
      success: true,
      data: result.subscriptions,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list subscriptions'
    });
  }
};

export const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SuperAdminService.listSubscriptionPlans();
    return res.status(200).json({
      success: true,
      data: plans
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list subscription plans'
    });
  }
};

export const createSubscriptionPlan = async (req, res) => {
  try {
    const { isValid, errors } = validateCreatePlan(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, errors });
    }

    const plan = await SuperAdminService.createSubscriptionPlan(req.body);
    return res.status(201).json({
      success: true,
      message: 'SaaS Subscription Plan created successfully',
      data: plan
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create subscription plan'
    });
  }
};

export const updateSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { isValid, errors } = validateUpdatePlan(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, errors });
    }

    const plan = await SuperAdminService.updateSubscriptionPlan(id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: plan
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update subscription plan'
    });
  }
};

export const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    await SuperAdminService.deleteSubscriptionPlan(id);
    return res.status(200).json({
      success: true,
      message: 'Subscription plan removed or deactivated successfully'
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete subscription plan'
    });
  }
};

export const getPlatformPayments = async (req, res) => {
  try {
    const { search, status, type, page, limit } = req.query;
    const result = await SuperAdminService.listPlatformPayments({ search, status, type, page, limit });
    return res.status(200).json({
      success: true,
      data: result.payments,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list platform payments'
    });
  }
};

export const getPlatformCommissions = async (req, res) => {
  try {
    const { gymId, status, page, limit } = req.query;
    const result = await SuperAdminService.listPlatformCommissions({ gymId, status, page, limit });
    return res.status(200).json({
      success: true,
      data: result.commissions,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list platform commissions'
    });
  }
};

export const getPlatformPayouts = async (req, res) => {
  try {
    const { gymId, status, page, limit } = req.query;
    const result = await SuperAdminService.listPlatformPayouts({ gymId, status, page, limit });
    return res.status(200).json({
      success: true,
      data: result.payouts,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list platform payouts'
    });
  }
};

export const getPlatformSettings = async (req, res) => {
  try {
    const data = await SuperAdminService.getPlatformSettings(req.user.userId);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch platform settings'
    });
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const updated = await SuperAdminService.updatePlatformSettings(req.user.userId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully',
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update platform settings'
    });
  }
};

export default {
  getDashboard,
  getGyms,
  getGymById,
  updateGymSubscription,
  getSubscriptions,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getPlatformPayments,
  getPlatformCommissions,
  getPlatformPayouts,
  getPlatformSettings,
  updatePlatformSettings
};

