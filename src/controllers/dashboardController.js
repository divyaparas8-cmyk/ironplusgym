import dashboardService from '../services/dashboardService.js';

export const getOverview = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await dashboardService.getOverview(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
