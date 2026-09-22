import { Router } from 'express';
import { getOverview, getTimeSeries } from '../controllers/dashboardController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/overview', getOverview);
router.get('/time-series', getTimeSeries);

export default router;
