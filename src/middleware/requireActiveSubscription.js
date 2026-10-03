import { verifyToken } from '../utils/jwt.js';
import GymSubscriptionService from '../services/gymSubscriptionService.js';

/**
 * Enforces active Gym SaaS software subscription for tenant-protected routes.
 * Authenticates request if req.user is not yet attached.
 * Bypasses for platform SUPER_ADMIN.
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const decoded = verifyToken(token);
      if (!decoded || !decoded.userId || (!decoded.gymId && decoded.role !== 'SUPER_ADMIN')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      req.user = {
        userId: decoded.userId,
        gymId: decoded.gymId || null,
        role: decoded.role
      };
    }

    // Platform Super Admins are exempt from tenant subscription lock
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const gymId = req.user.gymId;
    if (!gymId) {
      return res.status(401).json({
        success: false,
        message: 'Tenant gym context required'
      });
    }

    const accessCheck = await GymSubscriptionService.isGymAccessAllowed(gymId);

    if (accessCheck.allowed) {
      req.gymSubscription = accessCheck.subscription;

      if (accessCheck.isGracePeriod) {
        res.setHeader('X-Subscription-Status', 'GRACE_PERIOD');
      }

      return next();
    }

    // Access locked / expired
    return res.status(403).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Your gym software subscription has expired or is locked. Please renew your subscription to continue using IronPulse.',
      data: {
        status: accessCheck.status,
        reason: accessCheck.reason,
        currentPeriodEnd: accessCheck.subscription?.currentPeriodEnd || null,
        gracePeriodEnd: accessCheck.subscription?.gracePeriodEnd || null,
        plan: accessCheck.subscription?.plan || null
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication session'
    });
  }
};

export default requireActiveSubscription;
