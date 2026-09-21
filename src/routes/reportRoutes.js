import { Router } from 'express';
import {
  getOverviewReport,
  getRevenueReport,
  getMembersReport,
  getPaymentsReport
} from '../controllers/reportController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/overview', getOverviewReport);
router.get('/revenue', getRevenueReport);
router.get('/members', getMembersReport);
router.get('/payments', getPaymentsReport);

export default router;
