import express from 'express';
import cors from 'cors';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/plans', membershipPlanRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recurring-billing', recurringBillingRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/notification-templates', notificationTemplateRoutes);
app.use('/api/dunning', dunningRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditLogRoutes);

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

// Start server
const server = app.listen(PORT, () => {
  console.log(`[IronPulse Server] Running on http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[IronPulse Server] Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[IronPulse Server] Database disconnected. Process terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
