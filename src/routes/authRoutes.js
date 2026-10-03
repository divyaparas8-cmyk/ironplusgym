import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, register, getCurrentUser, updateGymSettings, forgotPassword, resetPassword } from '../controllers/authController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Stricter rate limiting for authentication & brute force prevention
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 reset requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again later.'
  }
});

// Public endpoints with rate limiting
router.post('/login', authLimiter, login);
router.post('/register', authLimiter, register);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Authenticated endpoints
router.get('/me', verifyAuth, getCurrentUser);
router.put('/gym', verifyAuth, requireRole('OWNER', 'ADMIN'), updateGymSettings);

export default router;
