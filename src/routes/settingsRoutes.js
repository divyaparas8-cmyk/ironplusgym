import { Router } from 'express';
import {
  getBillingSettings,
  updateBillingSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getPaymentProvider,
  getPaymentMode,
  updatePaymentMode,
  getConnectAccount,
  startConnectOnboarding,
  refreshConnectStatus,
  getConnectDashboardLink,
  getCommissionConfig,
  updateCommissionConfig,
  getPayoutRecords,
  getPaymentQr,
  updatePaymentQr,
  deletePaymentQr
} from '../controllers/settingsController.js';
import { verifyAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.use(verifyAuth);

router.get('/billing', getBillingSettings);
router.put('/billing', updateBillingSettings);

router.get('/notifications', getNotificationSettings);
router.put('/notifications', updateNotificationSettings);

router.get('/provider', getPaymentProvider);

// Member Payment QR Management (Tenant Isolated)
router.get('/payment-qr', getPaymentQr);
router.post('/payment-qr', requireRole('OWNER', 'ADMIN'), updatePaymentQr);
router.put('/payment-qr', requireRole('OWNER', 'ADMIN'), updatePaymentQr);
router.delete('/payment-qr', requireRole('OWNER', 'ADMIN'), deletePaymentQr);

// Payment Mode (Direct Merchant vs Connect Platform)
router.get('/payment-mode', getPaymentMode);
router.put('/payment-mode', requireRole('OWNER', 'ADMIN'), updatePaymentMode);

// Stripe Connect Onboarding & Account Management
router.get('/connect/account', getConnectAccount);
router.post('/connect/onboard', requireRole('OWNER', 'ADMIN'), startConnectOnboarding);
router.post('/connect/refresh-status', requireRole('OWNER', 'ADMIN'), refreshConnectStatus);
router.get('/connect/dashboard-link', requireRole('OWNER', 'ADMIN'), getConnectDashboardLink);

// Platform Commission Configuration
router.get('/commission', getCommissionConfig);
router.put('/commission', requireRole('OWNER', 'ADMIN'), updateCommissionConfig);

// Payouts Ledger
router.get('/payouts', getPayoutRecords);

export default router;

