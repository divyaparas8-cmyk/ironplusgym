import { Router } from 'express';
import { getMemberAuditLogs, getRecentAuditLogs } from '../controllers/auditLogController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

router.use(verifyAuth);

router.get('/member/:memberId', getMemberAuditLogs);
router.get('/', getRecentAuditLogs);

export default router;
