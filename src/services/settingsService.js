import prisma from '../prisma.js';

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
    let provider = await prisma.paymentProvider.findFirst({
      where: { gymId }
    });

    if (!provider) {
      provider = await prisma.paymentProvider.create({
        data: {
          gymId,
          provider: 'STRIPE',
          status: 'CONNECTED',
          merchantAccountId: 'acct_ironpulse_simulated',
          environment: 'sandbox',
          config: { publishableKey: 'pk_test_ironpulse_simulated' }
        }
      });
    }

    return provider;
  }
};

export default settingsService;
