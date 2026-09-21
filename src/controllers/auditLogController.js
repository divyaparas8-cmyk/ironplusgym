import auditLogService from '../services/auditLogService.js';

export const getMemberAuditLogs = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { memberId } = req.params;
    const logs = await auditLogService.getMemberLogs(gymId, memberId);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRecentAuditLogs = async (req, res) => {
  try {
    const gymId = req.user.gymId;
    const { limit = 50 } = req.query;
    const logs = await auditLogService.getRecentLogs(gymId, limit);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
