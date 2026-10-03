import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';

/**
 * Platform Initialization & Bootstrap Service
 * Ensures Super Admin account, default SaaS plans, and Gym subscriptions exist.
 */
export const initPlatformBootstrap = async () => {
  try {
    // 1. Seed Default SaaS Software Subscription Plans if none exist
    const planCount = await prisma.gymSubscriptionPlan.count();
    let defaultPlan = null;

    if (planCount === 0) {
      const plans = [
        {
          name: 'Starter Tier',
          description: 'Essential gym membership management, barcode check-in, and member ledger for single-location gyms.',
          monthlyPrice: 49.00,
          yearlyPrice: 490.00,
          currency: 'USD',
          trialDays: 14,
          gracePeriodDays: 7,
          featureList: [
            'Up to 250 active members',
            'Full member billing & payment gateway',
            'Automated invoice generation',
            'SMS & Email courtesy dues reminders',
            'Standard analytics dashboard'
          ],
          isActive: true
        },
        {
          name: 'Growth Pro',
          description: 'Advanced automated dunning, multi-tier memberships, Stripe Connect, and smart payment retries for expanding gyms.',
          monthlyPrice: 99.00,
          yearlyPrice: 990.00,
          currency: 'USD',
          trialDays: 14,
          gracePeriodDays: 7,
          featureList: [
            'Up to 1,000 active members',
            'Autonomous recurring billing engine',
            'Smart dunning & automated retry cadence',
            'Stripe Connect split payouts & commission tracking',
            'Multi-channel WhatsApp & Email automation',
            'Priority technical support'
          ],
          isActive: true
        },
        {
          name: 'Enterprise Scale',
          description: 'Uncapped athlete rosters, multi-staff roles, custom webhook integrations, and dedicated platform SLA.',
          monthlyPrice: 199.00,
          yearlyPrice: 1990.00,
          currency: 'USD',
          trialDays: 14,
          gracePeriodDays: 14,
          featureList: [
            'Unlimited active members & staff seats',
            'Multi-location consolidation',
            'Zero transaction surcharge',
            'Custom notification templates & branding',
            'Dedicated onboarding manager & 24/7 hotline'
          ],
          isActive: true
        }
      ];

      for (const p of plans) {
        const created = await prisma.gymSubscriptionPlan.create({ data: p });
        if (!defaultPlan) defaultPlan = created;
      }
      console.log('[IronPulse Platform] Seeded default SaaS subscription plans.');
    } else {
      defaultPlan = await prisma.gymSubscriptionPlan.findFirst({
        where: { isActive: true },
        orderBy: { monthlyPrice: 'asc' }
      });
    }

    // 2. Seed Default Platform Super Admin if none exists
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'superadmin@ironpulse.club').trim().toLowerCase();
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { email: superAdminEmail, role: 'SUPER_ADMIN' }
    });

    if (!existingSuperAdmin) {
      const password = process.env.SUPER_ADMIN_PASSWORD || 'IronPulseAdmin2026!';
      const passwordHash = await bcrypt.hash(password, 12);

      await prisma.user.create({
        data: {
          gymId: null,
          name: 'Platform Super Administrator',
          email: superAdminEmail,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        }
      });
      console.log(`[IronPulse Platform] Provisioned Platform Super Admin: ${superAdminEmail}`);
    }

    // 3. Ensure all existing Gyms have an active / valid GymSubscription record
    const gymsWithoutSub = await prisma.gym.findMany({
      where: {
        subscription: null
      }
    });

    if (gymsWithoutSub.length > 0) {
      const now = new Date();
      // Provision active 1-year subscription for pre-existing gyms
      const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const gracePeriodEnd = new Date(oneYearAhead.getTime() + 14 * 24 * 60 * 60 * 1000);

      for (const gym of gymsWithoutSub) {
        await prisma.gymSubscription.create({
          data: {
            gymId: gym.id,
            planId: defaultPlan?.id || null,
            status: 'ACTIVE',
            price: defaultPlan ? defaultPlan.monthlyPrice : 49.00,
            currency: gym.currency || 'USD',
            billingInterval: 'MONTHLY',
            currentPeriodStart: now,
            currentPeriodEnd: oneYearAhead,
            gracePeriodEnd: gracePeriodEnd
          }
        });
      }
      console.log(`[IronPulse Platform] Backfilled active subscription for ${gymsWithoutSub.length} existing gym(s).`);
    }
  } catch (error) {
    console.error('[IronPulse Platform] Bootstrap initialization warning:', error.message);
  }
};

export default initPlatformBootstrap;
