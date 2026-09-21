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
