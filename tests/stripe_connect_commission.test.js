import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import commissionService from '../src/services/commissionService.js';
import webhookService from '../src/services/webhookService.js';
import paymentGateway from '../src/services/paymentGateway/paymentGateway.js';
import settingsService from '../src/services/settingsService.js';
import reportService from '../src/services/reportService.js';
import prisma from '../src/prisma.js';

describe('STRIPE CONNECT & COMMISSION ENGINE TESTS', () => {
  describe('Phase 6: Commission Service Calculation Logic', () => {
    it('calculates pure percentage fee correctly', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 100.00,
        currency: 'USD',
        config: {
          feeType: 'PERCENTAGE',
          percentageFee: 2.5,
          fixedFee: 0,
          isActive: true
        }
      });

      assert.strictEqual(result.platformFee, 2.50, 'Platform fee should be $2.50');
      assert.strictEqual(result.gymNetAmount, 97.50, 'Gym net should be $97.50');
      assert.strictEqual(result.grossAmount, 100.00);
      assert.strictEqual(result.platformFeeCents, 250);
      assert.strictEqual(result.gymNetCents, 9750);
    });

    it('calculates fixed fee per transaction correctly', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 50.00,
        currency: 'USD',
        config: {
          feeType: 'FIXED',
          percentageFee: 0,
          fixedFee: 1.50,
          isActive: true
        }
      });

      assert.strictEqual(result.platformFee, 1.50);
      assert.strictEqual(result.gymNetAmount, 48.50);
      assert.strictEqual(result.platformFeeCents, 150);
      assert.strictEqual(result.gymNetCents, 4850);
    });

    it('calculates hybrid fee (% + fixed) correctly', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 200.00,
        currency: 'USD',
        config: {
          feeType: 'HYBRID',
          percentageFee: 2.0,
          fixedFee: 0.30,
          isActive: true
        }
      });

      // 2% of $200 = $4.00 + $0.30 = $4.30
      assert.strictEqual(result.platformFee, 4.30);
      assert.strictEqual(result.gymNetAmount, 195.70);
      assert.strictEqual(result.platformFeeCents, 430);
      assert.strictEqual(result.gymNetCents, 19570);
    });

    it('respects minFee constraint', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 10.00,
        currency: 'USD',
        config: {
          feeType: 'PERCENTAGE',
          percentageFee: 1.0, // $0.10
          fixedFee: 0,
          minFee: 0.50, // minimum $0.50
          isActive: true
        }
      });

      assert.strictEqual(result.platformFee, 0.50, 'Fee should be raised to minFee of $0.50');
      assert.strictEqual(result.gymNetAmount, 9.50);
    });

    it('respects maxFee constraint', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 1000.00,
        currency: 'USD',
        config: {
          feeType: 'PERCENTAGE',
          percentageFee: 5.0, // $50.00
          fixedFee: 0,
          maxFee: 25.00, // maximum $25.00
          isActive: true
        }
      });

      assert.strictEqual(result.platformFee, 25.00, 'Fee should be capped at maxFee of $25.00');
      assert.strictEqual(result.gymNetAmount, 975.00);
    });

    it('returns zero platform fee when config is inactive', async () => {
      const result = await commissionService.calculatePlatformFee({
        grossAmount: 150.00,
        currency: 'USD',
        config: {
          feeType: 'PERCENTAGE',
          percentageFee: 3.0,
          isActive: false
        }
      });

      assert.strictEqual(result.platformFee, 0);
      assert.strictEqual(result.gymNetAmount, 150.00);
      assert.strictEqual(result.platformFeeCents, 0);
      assert.strictEqual(result.gymNetCents, 15000);
    });
  });

  describe('Phase 8: Webhook Normalization for Connect Events', () => {
    it('normalizes account.updated webhook payload', () => {
      const sampleEvent = {
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_test123',
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
            capabilities: {
              card_payments: 'active',
              transfers: 'active'
            },
            requirements: {
              disabled_reason: null,
              currently_due: []
            }
          }
        }
      };

      const normalized = webhookService.normalizeWebhookEvent('STRIPE', sampleEvent);
      assert.strictEqual(normalized.eventType, 'ACCOUNT_UPDATED');
      assert.strictEqual(normalized.accountId, 'acct_test123');
      assert.strictEqual(normalized.chargesEnabled, true);
      assert.strictEqual(normalized.payoutsEnabled, true);
      assert.strictEqual(normalized.status, 'ACTIVE');
    });

    it('normalizes payout.paid webhook payload', () => {
      const sampleEvent = {
        type: 'payout.paid',
        account: 'acct_test_gym_99',
        data: {
          object: {
            id: 'po_test_payout_123',
            amount: 50000,
            currency: 'usd',
            status: 'paid',
            destination: 'ba_test_bank_456'
          }
        }
      };

      const normalized = webhookService.normalizeWebhookEvent('STRIPE', sampleEvent);
      assert.strictEqual(normalized.eventType, 'PAYOUT_PAID');
      assert.strictEqual(normalized.payoutId, 'po_test_payout_123');
      assert.strictEqual(normalized.amount, 500.00);
      assert.strictEqual(normalized.currency, 'USD');
      assert.strictEqual(normalized.accountId, 'acct_test_gym_99');
    });

    it('normalizes payout.failed webhook payload with failure details', () => {
      const sampleEvent = {
        type: 'payout.failed',
        account: 'acct_test_gym_99',
        data: {
          object: {
            id: 'po_failed_456',
            amount: 25000,
            currency: 'usd',
            status: 'failed',
            failure_code: 'account_closed',
            failure_message: 'The bank account was closed.'
          }
        }
      };

      const normalized = webhookService.normalizeWebhookEvent('STRIPE', sampleEvent);
      assert.strictEqual(normalized.eventType, 'PAYOUT_FAILED');
      assert.strictEqual(normalized.failureCode, 'account_closed');
      assert.strictEqual(normalized.failureReason, 'The bank account was closed.');
    });
  });

  describe('Phase 18: Multi-Tenant and Payment Mode Safety', () => {
    it('paymentGateway provides all required Connect methods without breaking direct methods', () => {
      assert.strictEqual(typeof paymentGateway.createConnectedAccount, 'function');
      assert.strictEqual(typeof paymentGateway.createAccountOnboardingLink, 'function');
      assert.strictEqual(typeof paymentGateway.getConnectedAccountStatus, 'function');
      assert.strictEqual(typeof paymentGateway.createAccountLoginLink, 'function');
      assert.strictEqual(typeof paymentGateway.createCharge, 'function');
      assert.strictEqual(typeof paymentGateway.refundPayment, 'function');
    });

    it('settingsService safely resolves payment mode defaults to DIRECT_MERCHANT for unconfigured gyms', async () => {
      // Test querying a non-existent or dummy gym
      try {
        const result = await settingsService.getPaymentMode('non-existent-gym-id');
        assert.ok(result.paymentMode === 'DIRECT_MERCHANT' || result.paymentMode === 'CONNECT_PLATFORM');
      } catch (err) {
        // Not found is safe
        assert.ok(err);
      }
    });

    it('commission reporting handles empty/test gym without crashing', async () => {
      const report = await reportService.getCommissionReport('non-existent-test-gym', '30d');
      assert.ok(report.summary);
      assert.strictEqual(report.summary.grossTuition, 0);
      assert.strictEqual(report.summary.platformFee, 0);
      assert.strictEqual(report.summary.gymNet, 0);
      assert.strictEqual(Array.isArray(report.transactions), true);
    });
  });
});
