import { Router } from 'express';
import { runRecurringBillingJob, runDunningJob, getSchedulerStatus } from '../services/schedulerService.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Middleware to permit either valid auth token with OWNER/ADMIN role OR valid CRON_SECRET header
const authorizeCronOrAdmin = (req, res, next) => {
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret && cronSecret === process.env.CRON_SECRET) {
    req.isCloudCron = true;
    return next();
  }

  // Fallback to standard session/token auth
  verifyAuth(req, res, () => {
    if (['OWNER', 'ADMIN'].includes(req.user?.role)) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to invoke scheduler' });
  });
};

/**
 * GET /api/scheduler/status
 * View scheduler state and last run metadata
 */
router.get('/status', verifyAuth, requireRole('OWNER', 'ADMIN'), (req, res) => {
  const status = getSchedulerStatus();
  res.json({ success: true, data: status });
});

/**
 * POST /api/scheduler/run-recurring
 * Trigger recurring billing run immediately (idempotent)
 */
router.post('/run-recurring', authorizeCronOrAdmin, async (req, res) => {
  try {
    const gymId = req.isCloudCron ? null : (req.user?.role === 'SUPERADMIN' ? null : req.user?.gymId);
    const result = await runRecurringBillingJob(gymId);
    res.json({ success: true, message: 'Recurring billing execution completed', data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/scheduler/run-dunning
 * Trigger dunning run immediately (idempotent)
 */
router.post('/run-dunning', authorizeCronOrAdmin, async (req, res) => {
  try {
    const gymId = req.isCloudCron ? null : (req.user?.role === 'SUPERADMIN' ? null : req.user?.gymId);
    const result = await runDunningJob(gymId);
    res.json({ success: true, message: 'Dunning execution completed', data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
