import jwt from 'jsonwebtoken';

/**
 * Generate a signed JWT token
 * @param {Object} payload - Token payload containing { userId, gymId, role }
 * @returns {string} Signed JWT
 */
export const generateToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

  return jwt.sign(
    {
      userId: payload.userId,
      gymId: payload.gymId,
      role: payload.role
    },
    secret,
    { expiresIn }
  );
};

/**
 * Verify and decode a JWT token
 * @param {string} token - Bearer JWT string
 * @returns {Object} Decoded payload
 */
export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  return jwt.verify(token, secret);
};
