import settingsService from '../services/settingsService.js';

export const getBillingSettings = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getBilling(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBillingSettings = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.updateBilling(gymId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getNotificationSettings = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getNotifications(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateNotificationSettings = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.updateNotifications(gymId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPaymentProvider = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getProvider(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPaymentMode = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getPaymentMode(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePaymentMode = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { paymentMode } = req.body;
    const data = await settingsService.updatePaymentMode(gymId, paymentMode);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getConnectAccount = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getConnectAccount(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const startConnectOnboarding = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { returnUrl, refreshUrl } = req.body;
    const data = await settingsService.startConnectOnboarding(gymId, { returnUrl, refreshUrl });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const refreshConnectStatus = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.refreshConnectStatus(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getConnectDashboardLink = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getConnectDashboardLink(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCommissionConfig = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { default: CommissionService } = await import('../services/commissionService.js');
    const data = await CommissionService.getGymCommissionConfig(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCommissionConfig = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { default: CommissionService } = await import('../services/commissionService.js');
    const data = await CommissionService.saveGymCommissionConfig({
      gymId,
      ...req.body
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPayoutRecords = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getPayouts(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPaymentQr = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.getPaymentQr(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const updatePaymentQr = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.updatePaymentQr(gymId, {
      ...req.body,
      userId: req.user.userId
    });
    res.json({ success: true, message: 'Payment QR code saved successfully', data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const deletePaymentQr = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await settingsService.deletePaymentQr(gymId, {
      userId: req.user.userId
    });
    res.json({ success: true, message: data.message, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

