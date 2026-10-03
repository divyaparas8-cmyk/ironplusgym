/**
 * Role-based Authorization Middleware
 * Enforces role restrictions based on verified req.user.role
 * @param  {...string} allowedRoles - e.g. 'OWNER', 'ADMIN'
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    next();
  };
};

/**
 * Super Admin Authorization Middleware
 * Enforces that req.user has SUPER_ADMIN role
 */
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required'
    });
  }

  next();
};
