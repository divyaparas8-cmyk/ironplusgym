import prisma from '../prisma.js';
import paymentGateway from './paymentGateway/paymentGateway.js';

export const settingsService = {
  async getBilling(gymId) {
    let policy = await prisma.billingPolicy.findUnique({
      where: { gymId }
    });

    if (!policy) {
      policy = await prisma.billingPolicy.create({
        data: {
          gymId,
          defaultGracePeriodDays: 5,
          retryCadenceDays: [1, 3, 5, 7],
          latePaymentFee: 15.00,
          salesTaxPercentage: 8.50,
          currency: 'USD'
        }
      });
    }

    return policy;
  },

  async updateBilling(gymId, data) {
    const {
      defaultGracePeriodDays = 5,
      retryCadenceDays = [1, 3, 5, 7],
      latePaymentFee = 15.00,
      salesTaxPercentage = 8.50,
      currency = 'USD'
    } = data;

    return prisma.billingPolicy.upsert({
      where: { gymId },
      update: {
        defaultGracePeriodDays: Number(defaultGracePeriodDays),
        retryCadenceDays,
        latePaymentFee: Number(latePaymentFee),
        salesTaxPercentage: Number(salesTaxPercentage),
        currency
      },
      create: {
        gymId,
        defaultGracePeriodDays: Number(defaultGracePeriodDays),
        retryCadenceDays,
        latePaymentFee: Number(latePaymentFee),
        salesTaxPercentage: Number(salesTaxPercentage),
        currency
      }
    });
  },

  async getNotifications(gymId) {
    const settings = await prisma.integrationSetting.findMany({
      where: { gymId }
    });

    const email = settings.find(s => s.provider === 'SENDGRID_EMAIL') || { isEnabled: true };
    const sms = settings.find(s => s.provider === 'TWILIO_SMS') || { isEnabled: true };
    const whatsapp = settings.find(s => s.provider === 'WHATSAPP_API') || { isEnabled: false };

    return { email, sms, whatsapp, list: settings };
  },

  async updateNotifications(gymId, { provider, isEnabled, config }) {
    if (!provider) throw new Error('Provider is required');

    return prisma.integrationSetting.upsert({
      where: {
        gymId_provider: {
          gymId,
          provider
        }
      },
      update: {
        isEnabled: Boolean(isEnabled),
        config: config || {}
      },
      create: {
        gymId,
        provider,
        isEnabled: Boolean(isEnabled),
        config: config || {}
      }
    });
  },

  async getProvider(gymId) {
    const isConfigured = paymentGateway.isConfigured();
    const hasPublishable = Boolean(process.env.STRIPE_PUBLISHABLE_KEY);
    const hasWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

    const missingVariables = [];
    if (!process.env.STRIPE_SECRET_KEY) missingVariables.push('STRIPE_SECRET_KEY');
    if (!process.env.STRIPE_PUBLISHABLE_KEY) missingVariables.push('STRIPE_PUBLISHABLE_KEY');
    if (!process.env.STRIPE_WEBHOOK_SECRET) missingVariables.push('STRIPE_WEBHOOK_SECRET');

    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const webhookUrl = `${appUrl.replace(/\/+$/, '')}/api/webhooks/stripe`;
    const calculatedStatus = isConfigured ? 'CONNECTED' : 'CONFIGURATION_REQUIRED';

    let provider = await prisma.paymentProvider.findFirst({
      where: { gymId }
    });

    if (!provider) {
      provider = await prisma.paymentProvider.create({
        data: {
          gymId,
          provider: 'STRIPE',
          status: calculatedStatus,
          merchantAccountId: isConfigured ? (process.env.STRIPE_ACCOUNT_ID || 'stripe_account') : null,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
          config: {
            hasPublishableKey: hasPublishable,
            hasWebhookSecret: hasWebhook
          }
        }
      });
    } else if (provider.status !== calculatedStatus) {
      provider = await prisma.paymentProvider.update({
        where: { id: provider.id },
        data: {
          status: calculatedStatus,
          merchantAccountId: isConfigured ? (process.env.STRIPE_ACCOUNT_ID || provider.merchantAccountId || 'stripe_account') : null,
          config: {
            hasPublishableKey: hasPublishable,
            hasWebhookSecret: hasWebhook
          }
        }
      });
    }

    return {
      provider: 'STRIPE',
      status: calculatedStatus,
      isConfigured,
      environment: process.env.NODE_ENV === 'production' ? 'live' : 'test',
      webhookUrl,
      webhookConfigured: hasWebhook,
      publishableKeyConfigured: hasPublishable,
      missingVariables,
      paymentMethods: {
        card: {
          enabled: true,
          status: isConfigured ? 'READY' : 'CONFIGURATION_REQUIRED',
          supportedBrands: ['Visa', 'Mastercard', 'American Express', 'Discover']
        },
        ach: {
          enabled: true,
          status: isConfigured ? 'READY' : 'CONFIGURATION_REQUIRED',
          supportedRails: ['ACH Direct Debit (US)']
        },
        cash: {
          enabled: true,
          status: 'READY',
          type: 'In-Person Front Desk'
        },
        pos: {
          enabled: true,
          status: 'READY',
          type: 'Front Desk Terminal'
        }
      }
    };
  },

  async getPaymentMode(gymId) {
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { paymentMode: true, legalName: true }
    });
    return { paymentMode: gym?.paymentMode || 'DIRECT_MERCHANT' };
  },

  async updatePaymentMode(gymId, paymentMode) {
    const validModes = ['DIRECT_MERCHANT', 'CONNECT_PLATFORM'];
    const mode = validModes.includes(paymentMode) ? paymentMode : 'DIRECT_MERCHANT';

    const updated = await prisma.gym.update({
      where: { id: gymId },
      data: { paymentMode: mode }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        action: 'PAYMENT_MODE_UPDATED',
        entity: 'Gym',
        entityId: gymId,
        metadata: { paymentMode: mode }
      }
    });

    return { paymentMode: updated.paymentMode };
  },

  async getConnectAccount(gymId) {
    const provider = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'STRIPE' }
    });

    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { paymentMode: true, legalName: true, contactEmail: true, country: true }
    });

    const accountId = provider?.stripeAccountId || null;
    const isConfigured = paymentGateway.isConfigured();

    return {
      gymId,
      paymentMode: gym?.paymentMode || 'DIRECT_MERCHANT',
      stripeAccountId: accountId,
      status: provider?.stripeAccountStatus || (accountId ? 'ONBOARDING_REQUIRED' : 'NOT_CONNECTED'),
      chargesEnabled: provider?.chargesEnabled || false,
      payoutsEnabled: provider?.payoutsEnabled || false,
      detailsSubmitted: provider?.detailsSubmitted || false,
      isConfigured
    };
  },

  async startConnectOnboarding(gymId, { returnUrl, refreshUrl }) {
    const gym = await prisma.gym.findUnique({
      where: { id: gymId }
    });

    if (!gym) throw new Error('Gym not found');

    let provider = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'STRIPE' }
    });

    let accountId = provider?.stripeAccountId;

    // Create connected account if not already created
    if (!accountId) {
      const createRes = await paymentGateway.createConnectedAccount({
        email: gym.contactEmail,
        country: gym.country || 'US',
        companyName: gym.legalName,
        gymId
      });

      if (!createRes.success && createRes.configured) {
        throw new Error(createRes.error || 'Failed to create Stripe Express connected account');
      }

      accountId = createRes.accountId;

      if (provider) {
        provider = await prisma.paymentProvider.update({
          where: { id: provider.id },
          data: {
            stripeAccountId: accountId,
            stripeAccountStatus: 'ONBOARDING_REQUIRED'
          }
        });
      } else {
        provider = await prisma.paymentProvider.create({
          data: {
            gymId,
            provider: 'STRIPE',
            status: 'SANDBOX',
            stripeAccountId: accountId,
            stripeAccountStatus: 'ONBOARDING_REQUIRED'
          }
        });
      }
    }

    // Generate onboarding link
    const linkRes = await paymentGateway.createAccountOnboardingLink({
      accountId,
      refreshUrl,
      returnUrl
    });

    if (!linkRes.success && linkRes.configured) {
      throw new Error(linkRes.error || 'Failed to create onboarding link');
    }

    return {
      success: true,
      url: linkRes.url,
      accountId
    };
  },

  async refreshConnectStatus(gymId) {
    const provider = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'STRIPE' }
    });

    if (!provider || !provider.stripeAccountId) {
      return {
        success: false,
        status: 'NOT_CONNECTED',
        message: 'No connected Stripe account on file.'
      };
    }

    const liveStatus = await paymentGateway.getConnectedAccountStatus(provider.stripeAccountId);

    if (liveStatus.success) {
      await prisma.paymentProvider.update({
        where: { id: provider.id },
        data: {
          chargesEnabled: liveStatus.chargesEnabled,
          payoutsEnabled: liveStatus.payoutsEnabled,
          detailsSubmitted: liveStatus.detailsSubmitted,
          stripeAccountStatus: liveStatus.status,
          status: (liveStatus.chargesEnabled && liveStatus.payoutsEnabled) ? 'CONNECTED' : 'SANDBOX'
        }
      });
    }

    return liveStatus;
  },

  async getConnectDashboardLink(gymId) {
    const provider = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'STRIPE' }
    });

    if (!provider || !provider.stripeAccountId) {
      throw new Error('No Stripe connected account linked to this gym');
    }

    const res = await paymentGateway.createAccountLoginLink(provider.stripeAccountId);
    if (!res.success && res.configured) {
      throw new Error(res.error || 'Unable to generate Express Dashboard link');
    }

    return { url: res.url };
  },

  async getPayouts(gymId) {
    const payouts = await prisma.payoutRecord.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return payouts;
  },

  /**
   * Get Gym's Member Payment QR Configuration (Tenant Isolated)
   */
  async getPaymentQr(gymId) {
    const provider = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'CUSTOM_QR' }
    });

    if (!provider || !provider.config) {
      return {
        gymId,
        isConfigured: false,
        qrCodeUrl: null,
        upiId: null,
        displayName: null,
        instructions: null,
        status: 'DISCONNECTED',
        updatedAt: null
      };
    }

    const config = typeof provider.config === 'object' ? provider.config : {};
    return {
      gymId,
      isConfigured: Boolean(config.qrCodeUrl),
      qrCodeUrl: config.qrCodeUrl || null,
      upiId: config.upiId || null,
      displayName: config.displayName || null,
      instructions: config.instructions || null,
      status: provider.status,
      updatedAt: provider.updatedAt
    };
  },

  /**
   * Save or Update Gym's Member Payment QR Code (Tenant Isolated)
   */
  async updatePaymentQr(gymId, { qrCodeUrl, upiId, displayName, instructions, userId }) {
    if (!qrCodeUrl && !upiId) {
      const error = new Error('Either QR Code image or Payment UPI ID is required');
      error.statusCode = 400;
      throw error;
    }

    // Validate base64 image or URL size
    if (qrCodeUrl && typeof qrCodeUrl === 'string') {
      const isDataUrl = qrCodeUrl.startsWith('data:image/');
      const isHttpUrl = qrCodeUrl.startsWith('http://') || qrCodeUrl.startsWith('https://');
      if (!isDataUrl && !isHttpUrl) {
        const error = new Error('Invalid QR code format. Must be an image data URL or valid HTTP/HTTPS URL.');
        error.statusCode = 400;
        throw error;
      }

      // Check max size (limit data URLs to ~5MB)
      if (qrCodeUrl.length > 7 * 1024 * 1024) {
        const error = new Error('QR image file size is too large. Maximum allowed size is 5MB.');
        error.statusCode = 400;
        throw error;
      }
    }

    const configPayload = {
      qrCodeUrl: qrCodeUrl || null,
      upiId: upiId ? String(upiId).trim() : null,
      displayName: displayName ? String(displayName).trim() : null,
      instructions: instructions ? String(instructions).trim() : null,
      updatedAt: new Date().toISOString()
    };

    const updated = await prisma.paymentProvider.upsert({
      where: {
        gymId_provider: {
          gymId,
          provider: 'CUSTOM_QR'
        }
      },
      update: {
        status: 'CONNECTED',
        config: configPayload
      },
      create: {
        gymId,
        provider: 'CUSTOM_QR',
        status: 'CONNECTED',
        config: configPayload
      }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        userId: userId || null,
        action: 'PAYMENT_QR_UPDATED',
        entity: 'PaymentProvider',
        entityId: updated.id,
        metadata: {
          hasQrImage: Boolean(qrCodeUrl),
          upiId: upiId || null,
          displayName: displayName || null
        }
      }
    }).catch(() => {});

    return {
      gymId,
      isConfigured: Boolean(configPayload.qrCodeUrl),
      ...configPayload,
      status: 'CONNECTED',
      updatedAt: updated.updatedAt
    };
  },

  /**
   * Remove Gym's Member Payment QR Code (Tenant Isolated)
   */
  async deletePaymentQr(gymId, { userId } = {}) {
    const existing = await prisma.paymentProvider.findFirst({
      where: { gymId, provider: 'CUSTOM_QR' }
    });

    if (existing) {
      await prisma.paymentProvider.delete({
        where: { id: existing.id }
      });

      await prisma.auditLog.create({
        data: {
          gymId,
          userId: userId || null,
          action: 'PAYMENT_QR_DELETED',
          entity: 'PaymentProvider',
          entityId: existing.id,
          metadata: { provider: 'CUSTOM_QR' }
        }
      }).catch(() => {});
    }

    return {
      success: true,
      message: 'Member payment QR code removed successfully',
      isConfigured: false,
      qrCodeUrl: null,
      upiId: null,
      status: 'DISCONNECTED'
    };
  }
};

export default settingsService;
