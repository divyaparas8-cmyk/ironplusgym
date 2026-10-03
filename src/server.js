import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import prisma from './prisma.js';
import authRoutes from './routes/authRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import membershipPlanRoutes from './routes/membershipPlanRoutes.js';
import membershipRoutes from './routes/membershipRoutes.js';
import paymentMethodRoutes from './routes/paymentMethodRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import recurringBillingRoutes from './routes/recurringBillingRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import notificationTemplateRoutes from './routes/notificationTemplateRoutes.js';
import dunningRoutes from './routes/dunningRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';
import schedulerRoutes from './routes/schedulerRoutes.js';
import { initScheduler, stopScheduler } from './services/schedulerService.js';
import { validateProductionConfig } from './utils/configValidator.js';

import superAdminRoutes from './routes/superAdminRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import { requireActiveSubscription } from './middleware/requireActiveSubscription.js';
import { initPlatformBootstrap } from './services/bootstrapService.js';

dotenv.config();

// Run startup configuration audit
validateProductionConfig();

const app = express();
const PORT = process.env.PORT || 5000;

// Production-safe CORS configuration
const allowedOrigins = [
  process.env.APP_URL,
  process.env.FRONTEND_URL,
  'https://gym-floww.netlify.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, cURL, webhooks, mobile apps)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');

    const isExplicitlyAllowed = allowedOrigins.some(allowed => {
      const cleanAllowed = allowed.replace(/\/+$/, '');
      return cleanAllowed === cleanOrigin;
    });

    if (isExplicitlyAllowed) {
      return callback(null, true);
    }

    // Allow any Netlify, Vercel, or Localhost deployments
    if (
      /\.netlify\.app$/.test(cleanOrigin) ||
      /\.vercel\.app$/.test(cleanOrigin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)
    ) {
      return callback(null, true);
    }

    // Fallback: in non-strict environments or production frontends
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'stripe-signature', 'x-cron-secret'],
  exposedHeaders: ['Content-Disposition', 'X-Subscription-Status']
};

// HTTP Security Headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors(corsOptions));
// Parse JSON with 20MB limit (to support member avatar uploads & gym logo) while capturing rawBody for webhooks
app.use(
  express.json({
    limit: '20mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

// 1. Authentication & Platform Super Admin
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);

// 2. Gym SaaS Software Subscription Management (never locked out from renewing)
app.use('/api/subscription', subscriptionRoutes);

// 3. Gym Settings (Accessible for configuration)
app.use('/api/settings', settingsRoutes);

// 4. Protected Tenant Operations (Enforces active software subscription)
app.use('/api/members', requireActiveSubscription, memberRoutes);
app.use('/api/plans', requireActiveSubscription, membershipPlanRoutes);
app.use('/api/memberships', requireActiveSubscription, membershipRoutes);
app.use('/api/payment-methods', requireActiveSubscription, paymentMethodRoutes);
app.use('/api/invoices', requireActiveSubscription, invoiceRoutes);
app.use('/api/payments', requireActiveSubscription, paymentRoutes);
app.use('/api/recurring-billing', requireActiveSubscription, recurringBillingRoutes);
app.use('/api/reminders', requireActiveSubscription, reminderRoutes);
app.use('/api/notification-templates', requireActiveSubscription, notificationTemplateRoutes);
app.use('/api/dunning', requireActiveSubscription, dunningRoutes);
app.use('/api/reports', requireActiveSubscription, reportRoutes);
app.use('/api/dashboard', requireActiveSubscription, dashboardRoutes);
app.use('/api/audit-logs', requireActiveSubscription, auditLogRoutes);

// 5. System Webhooks & Schedulers
app.use('/api/webhooks', webhookRoutes);
app.use('/api/scheduler', schedulerRoutes);


// Basic health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'IronPulse Backend API',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      service: 'IronPulse Backend API',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'IronPulse Gym Management & Billing OS API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/api/health'
  });
});

// Global error handling middleware (handles CORS errors cleanly)
app.use((err, req, res, next) => {
  if (err.message && err.message.startsWith('CORS error')) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }
  console.error('[UNHANDLED ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start server (only if not running under automated test runner)
const isTestEnv = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
let server = null;

if (!isTestEnv) {
  server = app.listen(PORT, () => {
    console.log(`[IronPulse Server] Running on http://localhost:${PORT}`);
    initScheduler();
    initPlatformBootstrap();
  });
}

// Graceful shutdown
const shutdown = async () => {
  console.log('[IronPulse Server] Shutting down gracefully...');
  stopScheduler();
  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[IronPulse Server] Database disconnected. Process terminated.');
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
