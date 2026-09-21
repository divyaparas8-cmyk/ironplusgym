import { Router } from 'express';
import { login, register, getCurrentUser, updateGymSettings, forgotPassword } from '../controllers/authController.js';
import { verifyAuth } from '../middleware/auth.js';

const router = Router();

// Public endpoints
router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);

// Authenticated endpoints
router.get('/me', verifyAuth, getCurrentUser);
router.put('/gym', verifyAuth, updateGymSettings);

export default router;
