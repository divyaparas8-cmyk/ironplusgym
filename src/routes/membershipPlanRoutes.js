import { Router } from 'express';
import {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan
} from '../controllers/membershipPlanController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all plan routes
router.use(verifyAuth);

// GET /api/plans - List membership plans
router.get('/', getPlans);

// GET /api/plans/:id - Get single membership plan
router.get('/:id', getPlanById);

// POST /api/plans - Create new membership plan
router.post('/', requireRole('OWNER', 'ADMIN'), createPlan);

// PUT /api/plans/:id - Update membership plan
router.put('/:id', requireRole('OWNER', 'ADMIN'), updatePlan);

// PATCH /api/plans/:id/status - Toggle plan active status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updatePlanStatus);

// DELETE /api/plans/:id - Safe deletion of membership plan
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deletePlan);

export default router;
