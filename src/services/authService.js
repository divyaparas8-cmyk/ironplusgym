import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import { generateToken } from '../utils/jwt.js';

export class AuthService {
  /**
   * Authenticate user with email and password
   * @param {Object} credentials - { email, password }
   * @returns {Object} { user, token }
   */
  static async login({ email, password }) {
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      const error = new Error('Email and password are required');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user by email
    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail
      },
      include: {
        gym: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            contactEmail: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            timezone: true,
            currency: true,
            logoUrl: true,
            website: true
          }
        }
      }
    });

    // Generic error to avoid account enumeration
    if (!user) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // Check account status
    if (user.status !== 'ACTIVE') {
      const error = new Error('Account is inactive or suspended');
      error.statusCode = 403;
      throw error;
    }

    // Compare password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // Generate token with strictly needed claims
    const token = generateToken({
      userId: user.id,
      gymId: user.gymId,
      role: user.role
    });

    // Strip sensitive fields
    const safeUser = {
      id: user.id,
      gymId: user.gymId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      gym: user.gym
    };

    return {
      user: safeUser,
      token
    };
  }

  /**
   * Fetch current authenticated user by verified identity
   * @param {string} userId
   * @param {string} gymId
   * @returns {Object} safe user object
   */
  static async getCurrentUser(userId, gymId) {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        gymId: gymId // Enforce tenant isolation
      },
      select: {
        id: true,
        gymId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        gym: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            contactEmail: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            timezone: true,
            currency: true,
            logoUrl: true,
            website: true
          }
        }
      }
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  /**
   * Register a new Gym + Owner User
   * @param {Object} data - { gymName, ownerName, email, password }
   * @returns {Object} { user, token }
   */
  static async register({ gymName, ownerName, email, password }) {
    if (!gymName || !ownerName || !email || !password) {
      const error = new Error('Gym name, owner name, email and password are all required');
      error.statusCode = 400;
      throw error;
    }

    if (password.length < 8) {
      const error = new Error('Password must be at least 8 characters');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate email
    const existing = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existing) {
      const error = new Error('An account with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create Gym + Owner User atomically
    const result = await prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({
        data: {
          legalName: gymName.trim(),
          tradeName: gymName.trim(),
          contactEmail: normalizedEmail,
          timezone: 'America/New_York',
          currency: 'USD',
          country: 'US'
        }
      });

      const user = await tx.user.create({
        data: {
          gymId: gym.id,
          name: ownerName.trim(),
          email: normalizedEmail,
          passwordHash,
          role: 'OWNER',
          status: 'ACTIVE'
        },
        select: {
          id: true,
          gymId: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return { gym, user };
    });

    const token = generateToken({
      userId: result.user.id,
      gymId: result.gym.id,
      role: result.user.role
    });

    return {
      user: { ...result.user, gym: result.gym },
      token
    };
  }
}

export default AuthService;
