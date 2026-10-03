import { Router } from 'express';
import {
  getOverviewReport,
  getRevenueReport,
  getMembersReport,
  getPaymentsReport,
  getCommissionReport
} from '../controllers/reportController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/overview', getOverviewReport);
router.get('/revenue', getRevenueReport);
router.get('/members', getMembersReport);
router.get('/payments', getPaymentsReport);
router.get('/commission', getCommissionReport);

export default router;

