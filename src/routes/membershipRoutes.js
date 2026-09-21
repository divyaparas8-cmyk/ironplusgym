import { Router } from 'express';
import {
  getMemberships,
  getMembershipById,
  createMembership,
  updateMembership,
  updateMembershipStatus,
  deleteMembership
} from '../controllers/membershipController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Require authentication for all membership routes
router.use(verifyAuth);

// GET /api/memberships - List memberships
router.get('/', getMemberships);

// GET /api/memberships/:id - Get single membership details
router.get('/:id', getMembershipById);

// POST /api/memberships - Create new membership
router.post('/', requireRole('OWNER', 'ADMIN'), createMembership);

// PUT /api/memberships/:id - Update membership
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateMembership);

// PATCH /api/memberships/:id/status - Update membership status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updateMembershipStatus);

// DELETE /api/memberships/:id - Safe deletion of membership
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteMembership);

export default router;
