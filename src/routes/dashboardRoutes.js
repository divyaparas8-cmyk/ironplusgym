import { Router } from 'express';
import { getOverview } from '../controllers/dashboardController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/overview', getOverview);

export default router;
