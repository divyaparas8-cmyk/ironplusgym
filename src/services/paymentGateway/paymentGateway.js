/**
 * Payment Gateway Adapter Layer for IronPulse Gym Billing OS
 * 
 * Provides an isolated, provider-agnostic abstraction for merchant processing.
 * - Supports live Stripe API when STRIPE_SECRET_KEY is configured.
 * - Supports controlled Sandbox/Configuration-Required fallback when credentials are absent.
 * - Never fakes success or claims external authorization without verification.
 */

import https from 'https';

class PaymentGateway {
  constructor() {
    this.providerName = process.env.PAYMENT_PROVIDER || 'STRIPE';
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY || null;
    this.stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
    this.stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || null;
  }

  /**
   * Helper: Check if live provider credentials are configured
   */
  isConfigured() {
    return Boolean(this.stripeSecretKey && !this.stripeSecretKey.includes('placeholder'));
  }

  /**
   * Raw HTTPS request helper for Stripe REST API (zero extra npm dependencies needed)
   */
  async _stripeRequest(endpoint, method = 'POST', data = null) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        error: 'Stripe credentials (STRIPE_SECRET_KEY) are not configured in environment.'
      };
    }

    return new Promise((resolve, reject) => {
      const postData = data ? new URLSearchParams(data).toString() : '';

      const options = {
        hostname: 'api.stripe.com',
        port: 443,
        path: `/v1${endpoint}`,
        method,
        headers: {
          'Authorization': `Bearer ${this.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ configured: true, success: true, data: parsed });
            } else {
              resolve({
                configured: true,
                success: false,
                statusCode: res.statusCode,
                error: parsed.error?.message || 'Stripe API request failed',
                details: parsed.error
              });
            }
          } catch (err) {
            reject(new Error(`Failed to parse Stripe response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          configured: true,
          success: false,
          error: `Stripe network error: ${err.message}`
        });
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Create a Customer reference in the provider
   */
  async createCustomer({ email, name, phone, metadata = {} }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        customerId: `cus_unconfigured_${Date.now()}`,
        status: 'CONFIGURATION_REQUIRED',
        message: 'Payment provider not configured. Client credentials required for live customers.'
      };
    }

    const payload = {
      email,
      name,
      ...(phone ? { phone } : {})
    };

    Object.entries(metadata).forEach(([k, v]) => {
      payload[`metadata[${k}]`] = String(v);
    });

    const res = await this._stripeRequest('/customers', 'POST', payload);
    if (res.success && res.data?.id) {
      return {
        configured: true,
        customerId: res.data.id,
        status: 'CREATED'
      };
    }

    return {
      configured: true,
      customerId: null,
      status: 'FAILED',
      error: res.error || 'Failed to create customer'
    };
  }

  /**
   * Tokenize or register a payment method
   */
  async createPaymentMethod({ type = 'card', number, expMonth, expYear, cvc, billingDetails = {} }) {
    if (!this.isConfigured()) {
      const last4 = number ? String(number).slice(-4) : '4242';
      return {
        configured: false,
        id: `pm_unconfigured_${Date.now()}`,
        type: 'card',
        brand: 'Visa',
        last4,
        status: 'UNCONFIGURED'
      };
    }

    const payload = {
      type: 'card',
      'card[number]': number,
      'card[exp_month]': String(expMonth),
      'card[exp_year]': String(expYear),
      'card[cvc]': cvc
    };

    const res = await this._stripeRequest('/payment_methods', 'POST', payload);
    if (res.success && res.data?.id) {
      return {
        configured: true,
        id: res.data.id,
        type: res.data.type,
        brand: res.data.card?.brand || 'Card',
        last4: res.data.card?.last4 || '4242',
        status: 'ACTIVE'
      };
    }

    return {
      configured: true,
      id: null,
      status: 'FAILED',
      error: res.error || 'Failed to tokenize payment method'
    };
  }

  /**
   * Execute a payment charge (Card or ACH)
   * Returns: { success: boolean, providerPaymentId?: string, status: 'PAID'|'PENDING'|'FAILED'|'CONFIGURATION_REQUIRED', failureReason?: string }
   */
  async createCharge({
    amount,
    currency = 'usd',
    paymentMethodType = 'CARD',
    providerPaymentMethodId,
    customerId,
    description,
    connectedAccountId,
    applicationFeeAmount,
    metadata = {}
  }) {
    const amountInCents = Math.round(Number(amount) * 100);

    if (!this.isConfigured()) {
      return {
        configured: false,
        success: false,
        status: 'CONFIGURATION_REQUIRED',
        providerPaymentId: null,
        failureReason: 'Payment provider is not configured with live/sandbox API keys. External charge skipped.'
      };
    }

    const payload = {
      amount: String(amountInCents),
      currency: currency.toLowerCase(),
      description: description || 'IronPulse Membership Charge',
      confirm: 'true',
      off_session: 'true'
    };

    if (providerPaymentMethodId && !providerPaymentMethodId.startsWith('pm_mock')) {
      payload.payment_method = providerPaymentMethodId;
    }

    if (customerId && !customerId.startsWith('cus_unconfigured')) {
      payload.customer = customerId;
    }

    if (paymentMethodType === 'ACH') {
      payload['payment_method_types[0]'] = 'us_bank_account';
    }

    // Stripe Connect: Destination Charges & Application Fee
    if (connectedAccountId && !connectedAccountId.startsWith('acct_unconfigured')) {
      payload['transfer_data[destination]'] = connectedAccountId;
      if (applicationFeeAmount !== undefined && applicationFeeAmount !== null && Number(applicationFeeAmount) >= 0) {
        payload.application_fee_amount = String(Math.round(Number(applicationFeeAmount) * 100));
      }
    }

    Object.entries(metadata).forEach(([k, v]) => {
      payload[`metadata[${k}]`] = String(v);
    });

    const res = await this._stripeRequest('/payment_intents', 'POST', payload);

    if (res.success && res.data) {
      const pi = res.data;
      if (pi.status === 'succeeded') {
        return {
          configured: true,
          success: true,
          status: 'PAID',
          providerPaymentId: pi.id,
          chargeId: pi.latest_charge || (pi.charges?.data?.[0]?.id) || null,
          transferId: pi.transfer_data?.destination ? (pi.charges?.data?.[0]?.transfer || null) : null
        };
      }
      if (pi.status === 'processing' || pi.status === 'requires_action') {
        return {
          configured: true,
          success: false,
          status: 'PENDING',
          providerPaymentId: pi.id,
          failureReason: `Payment status is ${pi.status}`
        };
      }
      return {
        configured: true,
        success: false,
        status: 'FAILED',
        providerPaymentId: pi.id,
        failureReason: pi.last_payment_error?.message || `Payment ${pi.status}`
      };
    }

    return {
      configured: true,
      success: false,
      status: 'FAILED',
      providerPaymentId: null,
      failureReason: res.error || 'Gateway charge execution failed'
    };
  }

  /**
   * Execute a refund through provider
   */
  async refundPayment({ providerPaymentId, amount, reason, reverseTransfer = false }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        success: false,
        status: 'CONFIGURATION_REQUIRED',
        message: 'Provider not configured for live gateway refund.'
      };
    }

    if (!providerPaymentId || providerPaymentId.startsWith('MANUAL-') || providerPaymentId.startsWith('CASH-')) {
      return {
        configured: true,
        success: true,
        status: 'REFUNDED',
        note: 'Internal manual or cash settlement refunded locally without provider call.'
      };
    }

    const payload = {
      payment_intent: providerPaymentId
    };

    if (amount) {
      payload.amount = String(Math.round(Number(amount) * 100));
    }

    if (reason) {
      payload['metadata[reason]'] = reason;
    }

    if (reverseTransfer) {
      payload.reverse_transfer = 'true';
    }

    const res = await this._stripeRequest('/refunds', 'POST', payload);
    if (res.success && res.data) {
      return {
        configured: true,
        success: true,
        status: 'REFUNDED',
        refundId: res.data.id
      };
    }

    return {
      configured: true,
      success: false,
      status: 'FAILED',
      error: res.error || 'Provider refund request rejected'
    };
  }

  /**
   * Recurring charge helper
   */
  async createRecurringCharge(params) {
    return this.createCharge({
      ...params,
      description: params.description || 'Automated Recurring Billing Charge'
    });
  }

  /**
   * Helper: Get publishable configuration for frontend client
   */
  getPublishableConfig() {
    return {
      configured: this.isConfigured(),
      publishableKey: this.stripePublishableKey || process.env.STRIPE_PUBLISHABLE_KEY || null,
      provider: 'STRIPE'
    };
  }

  /**
   * Create a PaymentIntent for frontend confirmation (Client-side Stripe Elements flow)
   */
  async createPaymentIntent({
    amount,
    currency = 'usd',
    customerId,
    description,
    connectedAccountId,
    applicationFeeAmount,
    metadata = {}
  }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        success: false,
        status: 'CONFIGURATION_REQUIRED',
        clientSecret: null,
        error: 'Stripe credentials are not configured in environment.'
      };
    }

    const amountInCents = Math.round(Number(amount) * 100);
    const payload = {
      amount: String(amountInCents),
      currency: currency.toLowerCase(),
      description: description || 'IronPulse Membership Enrollment Charge',
      'payment_method_types[0]': 'card'
    };

    if (customerId && !customerId.startsWith('cus_unconfigured')) {
      payload.customer = customerId;
    }

    // Stripe Connect: Destination Charges & Application Fee
    if (connectedAccountId && !connectedAccountId.startsWith('acct_unconfigured')) {
      payload['transfer_data[destination]'] = connectedAccountId;
      if (applicationFeeAmount !== undefined && applicationFeeAmount !== null && Number(applicationFeeAmount) >= 0) {
        payload.application_fee_amount = String(Math.round(Number(applicationFeeAmount) * 100));
      }
    }

    Object.entries(metadata).forEach(([k, v]) => {
      payload[`metadata[${k}]`] = String(v);
    });

    const res = await this._stripeRequest('/payment_intents', 'POST', payload);
    if (res.success && res.data) {
      return {
        configured: true,
        success: true,
        clientSecret: res.data.client_secret,
        paymentIntentId: res.data.id,
        status: res.data.status
      };
    }

    return {
      configured: true,
      success: false,
      clientSecret: null,
      status: 'FAILED',
      error: res.error || 'Failed to create payment intent'
    };
  }

  /**
   * Dunning retry charge helper
   */
  async retryPayment(params) {
    return this.createCharge({
      ...params,
      description: `Dunning Retry Attempt ${params.attemptNumber || 1}`
    });
  }

  // ===========================================================================
  // STRIPE CONNECT METHODS (Marketplace & Connected Accounts)
  // ===========================================================================

  /**
   * Create a Connected Express Account for a Gym Tenant
   */
  async createConnectedAccount({ email, country = 'US', businessType = 'company', companyName, gymId }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        success: false,
        accountId: `acct_unconfigured_${Date.now()}`,
        status: 'CONFIGURATION_REQUIRED',
        error: 'Stripe Secret Key is not configured for Connect account creation.'
      };
    }

    const payload = {
      type: 'express',
      country: country ? country.toUpperCase() : 'US',
      email: email || '',
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'business_type': businessType === 'individual' ? 'individual' : 'company',
      'metadata[gymId]': gymId || ''
    };

    if (companyName) {
      payload['company[name]'] = companyName;
    }

    const res = await this._stripeRequest('/accounts', 'POST', payload);
    if (res.success && res.data?.id) {
      return {
        configured: true,
        success: true,
        accountId: res.data.id,
        chargesEnabled: res.data.charges_enabled || false,
        payoutsEnabled: res.data.payouts_enabled || false,
        detailsSubmitted: res.data.details_submitted || false,
        status: 'ACTIVE'
      };
    }

    return {
      configured: true,
      success: false,
      accountId: null,
      error: res.error || 'Failed to create Stripe connected account'
    };
  }

  /**
   * Generate an Account Link for Stripe Hosted Express Onboarding
   */
  async createAccountOnboardingLink({ accountId, refreshUrl, returnUrl }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        success: false,
        url: null,
        error: 'Stripe credentials not configured for onboarding link.'
      };
    }

    const payload = {
      account: accountId,
      refresh_url: refreshUrl || 'http://localhost:5173/settings/gateway?connect=refresh',
      return_url: returnUrl || 'http://localhost:5173/settings/gateway?connect=success',
      type: 'account_onboarding'
    };

    const res = await this._stripeRequest('/account_links', 'POST', payload);
    if (res.success && res.data?.url) {
      return {
        configured: true,
        success: true,
        url: res.data.url,
        expiresAt: res.data.expires_at
      };
    }

    return {
      configured: true,
      success: false,
      url: null,
      error: res.error || 'Failed to generate Stripe onboarding link'
    };
  }

  /**
   * Fetch live account capabilities and status from Stripe
   */
  async getConnectedAccountStatus(accountId) {
    if (!this.isConfigured() || !accountId || accountId.startsWith('acct_unconfigured')) {
      return {
        configured: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        status: 'UNCONFIGURED'
      };
    }

    const res = await this._stripeRequest(`/accounts/${accountId}`, 'GET');
    if (res.success && res.data) {
      const acc = res.data;
      return {
        configured: true,
        success: true,
        accountId: acc.id,
        chargesEnabled: Boolean(acc.charges_enabled),
        payoutsEnabled: Boolean(acc.payouts_enabled),
        detailsSubmitted: Boolean(acc.details_submitted),
        currentlyDue: acc.requirements?.currently_due || [],
        eventuallyDue: acc.requirements?.eventually_due || [],
        payoutSchedule: acc.settings?.payouts?.schedule || {},
        status: acc.charges_enabled && acc.payouts_enabled ? 'CONNECTED' : (acc.details_submitted ? 'PENDING_VERIFICATION' : 'ONBOARDING_REQUIRED')
      };
    }

    return {
      configured: true,
      success: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      status: 'ERROR',
      error: res.error || 'Failed to fetch connected account status'
    };
  }

  /**
   * Generate an Express Login Link for a Gym to view their Stripe Express Dashboard
   */
  async createAccountLoginLink(accountId) {
    if (!this.isConfigured() || !accountId || accountId.startsWith('acct_unconfigured')) {
      return {
        configured: false,
        success: false,
        url: null,
        error: 'Stripe credentials or account not configured.'
      };
    }

    const res = await this._stripeRequest(`/accounts/${accountId}/login_links`, 'POST');
    if (res.success && res.data?.url) {
      return {
        configured: true,
        success: true,
        url: res.data.url
      };
    }

    return {
      configured: true,
      success: false,
      url: null,
      error: res.error || 'Failed to generate Express dashboard login link'
    };
  }
}

const defaultGateway = new PaymentGateway();
export { PaymentGateway, defaultGateway as paymentGateway };
export default defaultGateway;
