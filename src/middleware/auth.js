import { verifyToken } from '../utils/jwt.js';

/**
 * Authentication Middleware
 * Validates Bearer JWT from Authorization header and attaches req.user
 */
export const verifyAuth = (req, res, next) => {
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

  try {
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId || !decoded.gymId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Attach verified identity strictly from token
    req.user = {
      userId: decoded.userId,
      gymId: decoded.gymId,
      role: decoded.role
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};
