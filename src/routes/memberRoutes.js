import { Router } from 'express';
import {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  updateMemberStatus,
  deleteMember
} from '../controllers/memberController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Apply authentication to all member endpoints
router.use(verifyAuth);

// GET /api/members - List members with pagination, filtering, search, sorting
router.get('/', getMembers);

// POST /api/members - Create new member
router.post('/', requireRole('OWNER', 'ADMIN'), createMember);

// GET /api/members/:id - Get member profile details
router.get('/:id', getMemberById);

// PUT /api/members/:id - Update member profile
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateMember);

// PATCH /api/members/:id/status - Update member status
router.patch('/:id/status', requireRole('OWNER', 'ADMIN'), updateMemberStatus);

// DELETE /api/members/:id - Safe deletion of member
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteMember);

export default router;
