import express from 'express';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
} from '../controllers/notificationTemplateController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = express.Router();

// Enforce authentication across all template routes
router.use(verifyAuth);

router.get('/', getTemplates);
router.get('/:id', getTemplateById);
router.post('/', requireRole('OWNER', 'ADMIN'), createTemplate);
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateTemplate);
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteTemplate);

export default router;
