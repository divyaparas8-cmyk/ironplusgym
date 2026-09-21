import reportService from '../services/reportService.js';

export const getOverviewReport = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { range = '30d' } = req.query;
    const data = await reportService.getOverview(gymId, range);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRevenueReport = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { range = '30d' } = req.query;
    const data = await reportService.getRevenue(gymId, range);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMembersReport = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await reportService.getMembers(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPaymentsReport = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const data = await reportService.getPayments(gymId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
