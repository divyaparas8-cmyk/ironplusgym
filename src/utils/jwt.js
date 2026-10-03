import jwt from 'jsonwebtoken';

/**
 * Retrieve and strictly validate the JWT secret
 * @returns {string} JWT Secret
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    const error = new Error('JWT_SECRET is not configured in environment variables');
    error.statusCode = 500;
    throw error;
  }

  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    const error = new Error('JWT_SECRET must be at least 32 characters long in production mode.');
    error.statusCode = 500;
    throw error;
  }

  return secret;
};

/**
 * Generate a signed JWT token
 * @param {Object} payload - Token payload containing { userId, gymId, role }
 * @returns {string} Signed JWT
 */
export const generateToken = (payload) => {
  const secret = getJwtSecret();
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
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
};
