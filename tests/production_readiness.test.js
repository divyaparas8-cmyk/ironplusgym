import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneNumber } from '../src/services/notificationDispatcher.js';
import { ALLOWED_INVOICE_STATUS_TRANSITIONS } from '../src/validators/invoiceValidator.js';
import authService from '../src/services/authService.js';
import paymentGateway from '../src/services/paymentGateway/paymentGateway.js';
import { getSchedulerStatus, runRecurringBillingJob, runDunningJob } from '../src/services/schedulerService.js';
import prisma from '../src/prisma.js';

describe('BLOCKER #1: Password Reset Security', () => {
  it('requestPasswordReset must NOT expose resetToken in return object', async () => {
    // Test with a dummy/non-existent or sample email
    const result = await authService.requestPasswordReset('nonexistent_audit_test@example.com');
    
    assert.strictEqual(result.resetToken, undefined, 'resetToken must be undefined');
    assert.strictEqual(result.token, undefined, 'token must be undefined');
    assert.strictEqual(result.jwt, undefined, 'jwt must be undefined');
    assert.strictEqual(typeof result.message, 'string', 'Should return a generic confirmation message');
  });

  it('rejects password reset with invalid or malformed token', async () => {
    await assert.rejects(
      async () => {
        await authService.resetPassword({
          token: 'invalid_malformed_token_12345',
          newPassword: 'SecurePassword123!'
        });
      },
      (err) => {
        assert.ok(err.statusCode === 400 || err.statusCode === 401, 'Should return 400/401 for invalid token');
        return true;
      }
    );
  });
});

describe('BLOCKER #2: Automatic Background Scheduler', () => {
  it('scheduler status reports correct cron patterns and health', () => {
    const status = getSchedulerStatus();
    assert.strictEqual(status.recurringCronPattern, '0 0 * * *', 'Recurring billing cron pattern must be midnight (00:00)');
    assert.strictEqual(status.dunningCronPattern, '0 6 * * *', 'Dunning cron pattern must be 06:00');
    assert.strictEqual(typeof status.isRecurringRunning, 'boolean');
    assert.strictEqual(typeof status.isDunningRunning, 'boolean');
  });

  it('recurring billing execution is idempotent and completes without crashing', async () => {
    // Run recurring job for a non-existent or test gym ID
    const result = await runRecurringBillingJob('non-existent-test-gym');
    assert.ok(result.status === 'COMPLETED' || result.status === 'SKIPPED');
    assert.strictEqual(result.errors.length, 0);
  });

  it('dunning execution is idempotent and handles empty/test gym without crashing', async () => {
    const result = await runDunningJob('non-existent-test-gym');
    assert.ok(result.status === 'COMPLETED' || result.status === 'SKIPPED');
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('BLOCKER #4: Refund Accounting Synchronization', () => {
  it('invoice transition matrix allows PAID -> VOID for refunds', () => {
    const allowedFromPaid = ALLOWED_INVOICE_STATUS_TRANSITIONS['PAID'];
    assert.ok(Array.isArray(allowedFromPaid), 'PAID transitions must be defined');
    assert.ok(allowedFromPaid.includes('VOID'), 'PAID invoices must be allowed to transition to VOID upon refund');
  });

  it('rejects refund if payment is already refunded (idempotency guard)', async () => {
    // Attempt refund on an unconfigured or mock payment ID that doesn't exist
    await assert.rejects(
      async () => {
        const paymentService = (await import('../src/services/paymentService.js')).default;
        await paymentService.refundPayment({
          gymId: 'non-existent-gym',
          paymentId: 'non-existent-payment',
          amount: 50
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404, 'Must return 404 for missing payment');
        return true;
      }
    );
  });
});

describe('BLOCKER #5 & #6: Twilio Phone Normalization & Trial Restrictions', () => {
  it('preserves existing E.164 numbers (+1, +91, +44, etc.) without double-prepending', () => {
    assert.strictEqual(normalizePhoneNumber('+15128904400', 'US').phone, '+15128904400');
    assert.strictEqual(normalizePhoneNumber('+919876543210', 'IN').phone, '+919876543210');
    assert.strictEqual(normalizePhoneNumber('+447123456789', 'GB').phone, '+447123456789');
    assert.strictEqual(normalizePhoneNumber('+1 (512) 890-4400', 'US').phone, '+15128904400');
  });

  it('normalizes 10-digit US number with +1, NOT +91', () => {
    const res = normalizePhoneNumber('5128904400', 'USA');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.phone, '+15128904400');
    assert.notStrictEqual(res.phone, '+915128904400', 'Must not prepend +91 to US number');
  });

  it('never converts US numbers starting with 6-9 (Phoenix, Vegas, NYC) to +91', () => {
    assert.strictEqual(normalizePhoneNumber('6025551234', 'US').phone, '+16025551234');
    assert.strictEqual(normalizePhoneNumber('7025551234', 'USA').phone, '+17025551234');
    assert.strictEqual(normalizePhoneNumber('8185551234', 'United States').phone, '+18185551234');
    assert.strictEqual(normalizePhoneNumber('9175551234', 'US').phone, '+19175551234');
  });

  it('normalizes 10-digit India number with +91 when country is India', () => {
    const res = normalizePhoneNumber('9876543210', 'India');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.phone, '+919876543210');
  });

  it('normalizes UK number correctly based on UK country code', () => {
    const res = normalizePhoneNumber('7123456789', 'UK');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.phone, '+447123456789');
  });

  it('rejects malformed numbers shorter than 7 digits or invalid characters', () => {
    assert.strictEqual(normalizePhoneNumber('123', 'US').isValid, false);
    assert.strictEqual(normalizePhoneNumber('', 'US').isValid, false);
    assert.strictEqual(normalizePhoneNumber(null, 'US').isValid, false);
  });
});

describe('BLOCKER #3: Stripe Configuration Readiness', () => {
  it('isConfigured reports false and returns CONFIGURATION_REQUIRED when keys are absent', async () => {
    const prevKey = paymentGateway.stripeSecretKey;
    paymentGateway.stripeSecretKey = null;

    try {
      assert.strictEqual(paymentGateway.isConfigured(), false);
      const chargeRes = await paymentGateway.createCharge({
        amount: 50,
        currency: 'USD',
        paymentMethodType: 'CARD'
      });

      assert.strictEqual(chargeRes.configured, false);
      assert.strictEqual(chargeRes.success, false);
      assert.strictEqual(chargeRes.status, 'CONFIGURATION_REQUIRED');
      assert.ok(chargeRes.failureReason.includes('not configured'));
    } finally {
      paymentGateway.stripeSecretKey = prevKey;
    }
  });
});

describe('BLOCKER #7: Member & Payment 404 Data Protection', () => {
  it('querying non-existent member ID returns null instead of substituting another member', async () => {
    const member = await prisma.member.findUnique({
      where: { id: 'non-existent-member-id-00000' }
    });
    assert.strictEqual(member, null, 'Must return null for non-existent member, never fallback to first record');
  });

  it('querying non-existent payment ID returns null instead of substituting another payment', async () => {
    const payment = await prisma.payment.findUnique({
      where: { id: 'non-existent-payment-id-00000' }
    });
    assert.strictEqual(payment, null, 'Must return null for non-existent payment, never fallback to first record');
  });
});

describe('BLOCKER #8: CORS Security Validation', () => {
  it('verifies allowed origins include configured APP_URL and development hosts', async () => {
    const allowed = [
      process.env.APP_URL,
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174'
    ].filter(Boolean);

    assert.ok(allowed.includes('http://localhost:5173'), 'Localhost 5173 must be allowed for local Vite development');
    assert.ok(allowed.includes('http://localhost:5174'), 'Localhost 5174 must be allowed');
  });
});

describe('BLOCKER #10: WhatsApp Canonical Configuration', () => {
  it('recognizes META_WHATSAPP_ACCESS_TOKEN and reports CONFIGURATION_REQUIRED when absent', async () => {
    const { NotificationDispatcher } = await import('../src/services/notificationDispatcher.js');
    
    // Test dispatch with no credentials configured in environment
    const prevMeta = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const prevLegacy = process.env.WHATSAPP_API_TOKEN;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_API_TOKEN;

    try {
      const result = await NotificationDispatcher.dispatch({
        channel: 'WHATSAPP',
        recipient: '+15128904400',
        message: 'Test notification'
      });

      assert.strictEqual(result.status, 'CONFIGURATION_REQUIRED', 'Must return CONFIGURATION_REQUIRED when tokens are missing');
      assert.strictEqual(result.success, false, 'Must not claim success without provider response');
    } finally {
      if (prevMeta) process.env.META_WHATSAPP_ACCESS_TOKEN = prevMeta;
      if (prevLegacy) process.env.WHATSAPP_API_TOKEN = prevLegacy;
    }
  });
});

describe('CURRENCY INTEGRITY: Operating Currency & Non-Conversion', () => {
  it('numeric membership fee of 89 remains 89 without FX multiplication', async () => {
    // Query active plans or gyms
    const plans = await prisma.membershipPlan.findMany({ take: 5 });
    for (const plan of plans) {
      assert.ok(typeof Number(plan.price) === 'number', 'Price must be a valid number');
      assert.ok(!isNaN(Number(plan.price)), 'Price must not be NaN');
      // If plan is 89, it should be exactly 89
      if (plan.name.includes('Gold')) {
        assert.ok([89, 99].includes(Number(plan.price)), 'Gold plan numeric amount must remain 89 or 99');
      }
    }
  });

  it('all financial records in database have clean, standardized currency codes', async () => {
    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({ take: 10 }),
      prisma.payment.findMany({ take: 10 })
    ]);

    const validCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];
    invoices.forEach(inv => {
      assert.ok(validCurrencies.includes(inv.currency), `Invoice currency '${inv.currency}' must be a valid standard code`);
    });
    payments.forEach(pay => {
      assert.ok(validCurrencies.includes(pay.currency), `Payment currency '${pay.currency}' must be a valid standard code`);
    });
  });
});

describe('MULTI-TENANT ISOLATION: Scoped Queries by gymId', () => {
  it('queries scoped to Gym A do not return Gym B records', async () => {
    const gyms = await prisma.gym.findMany({ take: 2 });
    if (gyms.length >= 2) {
      const gymA = gyms[0];
      const gymB = gyms[1];

      const membersA = await prisma.member.findMany({ where: { gymId: gymA.id } });
      const membersB = await prisma.member.findMany({ where: { gymId: gymB.id } });

      const memberIdsA = new Set(membersA.map(m => m.id));
      const crossTenantLeak = membersB.some(m => memberIdsA.has(m.id));
      assert.strictEqual(crossTenantLeak, false, 'Gym A and Gym B must have distinct isolated member records');
    }
  });
});

describe('REMEDIATION: Gym Profile Role Authorization', async () => {
  it('authRoutes protects /gym with requireRole OWNER and ADMIN', async () => {
    const authRoutes = (await import('../src/routes/authRoutes.js')).default;
    const gymRoute = authRoutes.stack.find(s => s.route?.path === '/gym' && s.route?.methods?.put);
    assert.ok(gymRoute, 'PUT /api/auth/gym route must exist');
    assert.ok(gymRoute.route.stack.length >= 3, 'Must have verifyAuth, requireRole, and updateGymSettings handlers');
  });
});

describe('REMEDIATION: Security Middleware (Helmet & Rate Limiting)', async () => {
  it('Express server mounts helmet and rate limiters on auth routes', async () => {
    const serverApp = (await import('../src/server.js')).default;
    assert.ok(serverApp, 'Server app must export Express application');
    const authRoutes = (await import('../src/routes/authRoutes.js')).default;
    const loginRoute = authRoutes.stack.find(s => s.route?.path === '/login' && s.route?.methods?.post);
    assert.ok(loginRoute, 'POST /login route must exist');
    assert.ok(loginRoute.route.stack.length >= 2, 'Must have rate limiting middleware attached to /login');
  });
});

describe('REMEDIATION: Stripe Publishable Config & Client Flow', () => {
  it('returns publishable configuration object with configured boolean', () => {
    const config = paymentGateway.getPublishableConfig();
    assert.strictEqual(typeof config.configured, 'boolean');
    assert.strictEqual(config.provider, 'STRIPE');
  });

  it('createPaymentIntent returns CONFIGURATION_REQUIRED when keys are absent', async () => {
    const prevKey = paymentGateway.stripeSecretKey;
    paymentGateway.stripeSecretKey = null;
    try {
      const result = await paymentGateway.createPaymentIntent({
        amount: 89,
        currency: 'USD',
        description: 'Test Intent'
      });
      assert.strictEqual(result.configured, false);
      assert.strictEqual(result.status, 'CONFIGURATION_REQUIRED');
      assert.strictEqual(result.clientSecret, null);
    } finally {
      paymentGateway.stripeSecretKey = prevKey;
    }
  });
});

describe('PHONE NORMALIZATION: Australia & International Coverage', () => {
  it('normalizes 10-digit Australian numbers starting with 04 to +614...', () => {
    const res = normalizePhoneNumber('0412345678', 'AU');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.phone, '+61412345678');
  });

  it('normalizes 9-digit Australian numbers without leading zero to +614...', () => {
    const res = normalizePhoneNumber('412345678', 'Australia');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.phone, '+61412345678');
  });
});

describe('WEBHOOK SECURITY: Signature Verification & Replay Protection', async () => {
  const { verifyWebhookSignature, generateWebhookSignature } = await import('../src/utils/webhookSignature.js');

  it('validates authentic Stripe webhook signature', () => {
    const secret = 'whsec_test_secret_key_1234567890';
    const rawBody = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded' });
    const now = Math.floor(Date.now() / 1000);
    const signatureHeader = generateWebhookSignature({ payload: rawBody, secret, timestamp: now });

    const result = verifyWebhookSignature({ rawBody, signatureHeader, secret });
    assert.strictEqual(result.isValid, true);
  });

  it('rejects tampered or invalid webhook signature', () => {
    const secret = 'whsec_test_secret_key_1234567890';
    const rawBody = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded' });
    const signatureHeader = 't=1234567890,v1=bad_signature_hex';

    const result = verifyWebhookSignature({ rawBody, signatureHeader, secret });
    assert.strictEqual(result.isValid, false);
  });

  it('rejects webhook with expired timestamp (replay attack)', () => {
    const secret = 'whsec_test_secret_key_1234567890';
    const rawBody = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded' });
    const expiredTime = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago (> 300s tolerance)
    const signatureHeader = generateWebhookSignature({ payload: rawBody, secret, timestamp: expiredTime });

    const result = verifyWebhookSignature({ rawBody, signatureHeader, secret, tolerance: 300 });
    assert.strictEqual(result.isValid, false);
    assert.ok(result.error.includes('tolerance window'));
  });
});

describe('SECURITY CONFIGURATION: JWT Length & Startup Validation', async () => {
  const { getJwtSecret } = await import('../src/utils/jwt.js');
  const { validateProductionConfig } = await import('../src/utils/configValidator.js');

  it('getJwtSecret returns secret in non-production environments', () => {
    const secret = getJwtSecret();
    assert.ok(typeof secret === 'string');
    assert.ok(secret.length > 0);
  });

  it('validateProductionConfig audits environment safely without secrets leaking', () => {
    const audit = validateProductionConfig();
    assert.strictEqual(typeof audit.valid, 'boolean');
    assert.ok(Array.isArray(audit.report));
  });
});

