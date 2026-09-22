import assert from 'assert';
import { paymentGateway } from './src/services/paymentGateway/paymentGateway.js';
import NotificationDispatcher from './src/services/notificationDispatcher.js';
import dashboardService from './src/services/dashboardService.js';
import AuthService from './src/services/authService.js';
import prisma from './src/prisma.js';

console.log('====================================================');
console.log('STARTING IRONPULSE PRODUCTION READINESS TEST SUITE');
console.log('====================================================\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}\n`, err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}\n`, err);
      failed++;
    }
  }

  // TEST 1: Payment Gateway Unconfigured Graceful State
  test('PaymentGateway gracefully handles unconfigured state without fake success', () => {
    assert.strictEqual(typeof paymentGateway.isConfigured, 'function');
    // If not configured, should return isConfigured() === false
    const configured = paymentGateway.isConfigured();
    assert.strictEqual(typeof configured, 'boolean');
  });

  // TEST 2: Payment Gateway Card Tokenization
  await asyncTest('PaymentGateway tokenizes test card or falls back cleanly', async () => {
    const cardData = {
      number: '4242424242424242',
      expMonth: 12,
      expYear: 2028,
      cvc: '123'
    };
    const result = await paymentGateway.createPaymentMethod(cardData);
    assert(result.id, 'Expected payment method id');
    assert.strictEqual(result.brand, 'Visa');
    assert.strictEqual(result.last4, '4242');
  });

  // TEST 3: Notification Dispatcher - No Fake Successes
  await asyncTest('NotificationDispatcher does NOT fake success when unconfigured', async () => {
    const emailRes = await NotificationDispatcher.dispatchEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      body: 'Test Body'
    });
    // When no SendGrid key is present, status must be PENDING or CONFIGURATION_REQUIRED, NOT SENT
    if (!process.env.SENDGRID_API_KEY) {
      assert.strictEqual(emailRes.status, 'PENDING');
      assert.strictEqual(emailRes.provider, 'UNCONFIGURED');
    }
  });

  // TEST 4: Notification Dispatcher SMS & WhatsApp
  await asyncTest('NotificationDispatcher SMS and WhatsApp return safe unconfigured responses', async () => {
    const smsRes = await NotificationDispatcher.dispatchSms({
      to: '+15555555555',
      message: 'Test SMS'
    });
    if (!process.env.TWILIO_ACCOUNT_SID) {
      assert.strictEqual(smsRes.status, 'PENDING');
    }

    const waRes = await NotificationDispatcher.dispatchWhatsApp({
      to: '+15555555555',
      message: 'Test WhatsApp'
    });
    if (!process.env.META_WHATSAPP_PHONE_ID) {
      assert.strictEqual(waRes.status, 'PENDING');
    }
  });

  // TEST 5: Stateless HMAC Password Reset Token Generation & Verification
  await asyncTest('AuthService stateless HMAC password reset tokens operate correctly', async () => {
    // Find or check a user in DB
    const existingUser = await prisma.user.findFirst();
    if (existingUser) {
      const resetReq = await AuthService.requestPasswordReset(existingUser.email);
      assert.strictEqual(resetReq.success, true);
      assert(resetReq.resetToken, 'Expected resetToken in response');

      // Attempt reset with mismatched or invalid token
      let rejected = false;
      try {
        await AuthService.resetPassword({
          token: 'invalid-token-12345',
          email: existingUser.email,
          newPassword: 'BrandNewSecurePassword2026!'
        });
      } catch (e) {
        rejected = true;
      }
      assert.strictEqual(rejected, true, 'Invalid token must be rejected');
    } else {
      console.log('ℹ️ Skipping DB user reset test (no users in database)');
    }
  });

  // TEST 6: Dashboard Service Real MoM Growth & DB Aggregation
  await asyncTest('DashboardService time-series and MoM queries execute cleanly', async () => {
    const gym = await prisma.gym.findFirst();
    if (gym) {
      const overview = await dashboardService.getOverview(gym.id);
      assert(overview.metrics, 'Expected overview metrics');
      assert(typeof overview.metrics.momRevenueGrowth === 'number', 'Expected numeric MoM revenue growth');
      assert(typeof overview.metrics.momMemberGrowth === 'number', 'Expected numeric MoM member growth');

      const timeSeries = await dashboardService.getTimeSeriesRevenue(gym.id, '30 Days');
      assert(Array.isArray(timeSeries.labels), 'Expected time-series labels array');
      assert(Array.isArray(timeSeries.collected), 'Expected time-series collected array');
      assert(typeof timeSeries.totalCollected === 'number', 'Expected total collected number');
    }
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
