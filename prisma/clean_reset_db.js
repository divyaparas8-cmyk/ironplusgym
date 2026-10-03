import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function cleanAndResetDatabase() {
  console.log('🧹 Starting full database clean & fresh reset...');

  // 1. Delete all tables in proper foreign-key order
  console.log('🗑️  Deleting all existing transactions, payments, invoices, logs, and test gyms...');
  
  await prisma.commissionTransaction.deleteMany({});
  await prisma.payoutRecord.deleteMany({});
  await prisma.paymentAttempt.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.recurringBilling.deleteMany({});
  await prisma.reminder.deleteMany({});
  await prisma.paymentMethod.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.membershipPlan.deleteMany({});
  await prisma.notificationTemplate.deleteMany({});
  await prisma.integrationSetting.deleteMany({});
  await prisma.paymentProvider.deleteMany({});
  await prisma.billingPolicy.deleteMany({});
  await prisma.platformFeeConfig.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.gymSubscriptionInvoice.deleteMany({});
  await prisma.gymSubscription.deleteMany({});
  await prisma.gymSubscriptionPlan.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.gym.deleteMany({});

  console.log('✨ All old/test records successfully deleted.');

  // 2. Create Platform Super Admin
  const superAdminPasswordHash = bcrypt.hashSync('123456', 10);
  const superAdmin = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Platform Super Admin',
      email: 'superadmin@gmail.com',
      passwordHash: superAdminPasswordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      gymId: null
    }
  });
  console.log(`✅ Super Admin created: ${superAdmin.email} (Password: 123456)`);

  // 3. Create Standard SaaS Platform Plans
  const starterPlan = await prisma.gymSubscriptionPlan.create({
    data: {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Starter Tier',
      description: 'Essential management suite for single-location boutique studios & gyms',
      monthlyPrice: 49.00,
      yearlyPrice: 490.00,
      currency: 'USD',
      trialDays: 14,
      gracePeriodDays: 7,
      featureList: [
        'Up to 150 Active Members',
        'Direct Stripe & Cash Point-of-Sale',
        'Automated Invoicing & Dues Collection',
        'Email Reminders & Basic Reports'
      ],
      isActive: true
    }
  });

  const growthPlan = await prisma.gymSubscriptionPlan.create({
    data: {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Professional Tier',
      description: 'Advanced automation, SMS/WhatsApp marketing, and smart recurring dunning',
      monthlyPrice: 99.00,
      yearlyPrice: 990.00,
      currency: 'USD',
      trialDays: 14,
      gracePeriodDays: 7,
      featureList: [
        'Unlimited Active Members',
        'Stripe Connect + Direct Merchant Processing',
        'Multi-channel SMS, Email & WhatsApp Reminders',
        'Dunning Automations & Smart Retries',
        'Financial Ledgers & Tax Reports'
      ],
      isActive: true
    }
  });

  const enterprisePlan = await prisma.gymSubscriptionPlan.create({
    data: {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'Enterprise Tier',
      description: 'Multi-franchise headquarters control, custom branding, and dedicated priority SLA',
      monthlyPrice: 199.00,
      yearlyPrice: 1990.00,
      currency: 'USD',
      trialDays: 30,
      gracePeriodDays: 14,
      featureList: [
        'Unlimited Members & Multi-Location Scaling',
        'Custom Domain & White-label Branding',
        'Dedicated Account Manager & 99.99% SLA',
        'Full Webhook & REST API Integrations'
      ],
      isActive: true
    }
  });
  console.log(`✅ 3 Standard SaaS Plans created (Starter: $49/mo, Pro: $99/mo, Enterprise: $199/mo)`);

  // 4. Create 1 Clean Default Primary Gym Tenant
  const primaryGym = await prisma.gym.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      legalName: 'IronPulse Fitness Inc.',
      tradeName: 'IronPulse Athletic Club & Performance Lab',
      contactEmail: 'owner@ironpulse.club',
      phone: '+1 (512) 890-4400',
      address: '450 Spartan Way, Suite 100',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'United States',
      timezone: 'America/Chicago',
      currency: 'USD',
      paymentMode: 'DIRECT_MERCHANT',
      logoUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=160&auto=format&fit=crop&q=80',
      website: 'https://ironpulse.club'
    }
  });
  console.log(`✅ Clean Default Gym created: ${primaryGym.tradeName}`);

  // 5. Attach Active Subscription to Primary Gym
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setDate(now.getDate() + 30);

  await prisma.gymSubscription.create({
    data: {
      gymId: primaryGym.id,
      planId: growthPlan.id,
      status: 'ACTIVE',
      price: growthPlan.monthlyPrice,
      currency: 'USD',
      billingInterval: 'MONTHLY',
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth,
      trialStart: null,
      trialEnd: null
    }
  });

  // 6. Create Primary Gym Owner
  const ownerPasswordHash = bcrypt.hashSync('12345678', 10);
  const ownerUser = await prisma.user.create({
    data: {
      gymId: primaryGym.id,
      name: 'IronPulse Owner',
      email: 'demo@gmail.com',
      passwordHash: ownerPasswordHash,
      role: 'OWNER',
      status: 'ACTIVE'
    }
  });
  console.log(`✅ Gym Owner user created: ${ownerUser.email} (Password: 12345678)`);

  // 7. Seed Clean Membership Plans for Primary Gym
  const membershipPlans = [
    {
      id: 'PLAN-BASIC',
      name: 'Basic Iron',
      description: 'Essential gym floor access and cardio equipment',
      price: 49.00,
      billingFrequency: 'MONTHLY',
      featureList: [
        'Full access to main strength & cardio floor',
        'Standard locker room & shower access',
        'Mobile app barcode check-in',
        '1 Free fitness evaluation'
      ]
    },
    {
      id: 'PLAN-STANDARD',
      name: 'Standard Fitness',
      description: 'Expanded gym hours with unlimited studio classes',
      price: 89.00,
      billingFrequency: 'MONTHLY',
      featureList: [
        'All Basic Iron access perks',
        'Unlimited studio group classes (Spin, HIIT, Yoga)',
        'Extended 5:00 AM - Midnight gym access',
        '1 Monthly InBody Body Composition scan',
        '2 Guest passes per month'
      ]
    },
    {
      id: 'PLAN-ELITE',
      name: 'Elite Performance',
      description: 'Total athletic conditioning with recovery and saunas',
      price: 139.00,
      billingFrequency: 'MONTHLY',
      featureList: [
        '24/7 Biometric gym & functional turf access',
        'Unlimited group & advanced powerlifting zones',
        'Infrared sauna & cold plunge hydrotherapy',
        'Weekly automated nutrition & macro tracking',
        '4 Guest passes per month',
        '10% Pro-shop & supplement discount'
      ]
    },
    {
      id: 'PLAN-VIP',
      name: 'VIP Athlete',
      description: 'White-glove executive tier with dedicated coaching & perks',
      price: 199.00,
      billingFrequency: 'MONTHLY',
      featureList: [
        '24/7 All-facility unrestricted VIP access',
        '2 Monthly 1-on-1 Certified Personal Training sessions',
        'Private VIP locker with dedicated laundry service',
        'Unlimited guest passes (1 accompanied guest per visit)',
        'Full recovery suite priority booking',
        'Free monthly protein shake bar & towels'
      ]
    }
  ];

  for (const plan of membershipPlans) {
    await prisma.membershipPlan.create({
      data: {
        id: plan.id,
        gymId: primaryGym.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        billingFrequency: plan.billingFrequency,
        featureList: plan.featureList,
        isActive: true
      }
    });
  }
  console.log(`✅ 4 Membership Plans seeded for Primary Gym.`);

  // 8. Billing Policy for Primary Gym
  await prisma.billingPolicy.create({
    data: {
      gymId: primaryGym.id,
      defaultGracePeriodDays: 5,
      retryCadenceDays: [1, 3, 5, 7],
      latePaymentFee: 15.00,
      salesTaxPercentage: 8.50,
      currency: 'USD'
    }
  });

  // 9. Payment Provider (Sandbox Stripe)
  await prisma.paymentProvider.create({
    data: {
      gymId: primaryGym.id,
      provider: 'STRIPE',
      status: 'CONNECTED',
      merchantAccountId: 'acct_1NZX8849LkJ92',
      environment: 'sandbox',
      config: {
        publishableKey: 'pk_test_sample_ironpulse',
        webhookConfigured: true
      }
    }
  });

  // 10. Integration Settings
  await prisma.integrationSetting.createMany({
    data: [
      { gymId: primaryGym.id, provider: 'TWILIO_SMS', isEnabled: true, config: { senderId: 'IRONPULSE', fromNumber: '+15128904400' } },
      { gymId: primaryGym.id, provider: 'SENDGRID_EMAIL', isEnabled: true, config: { fromEmail: 'billing@ironpulse.club', fromName: 'IronPulse Club' } },
      { gymId: primaryGym.id, provider: 'WHATSAPP_API', isEnabled: false, config: { businessNumber: null } }
    ]
  });

  // 11. Notification Templates
  await prisma.notificationTemplate.createMany({
    data: [
      {
        gymId: primaryGym.id,
        name: 'Upcoming Payment Notice',
        type: 'UPCOMING_PAYMENT',
        channel: 'EMAIL',
        subject: 'IronPulse Courtesy Notice: Dues scheduled for processing',
        body: 'Hi {{firstName}}, this is a courtesy reminder that your dues of ${{amount}} for {{planName}} are scheduled for {{dueDate}}.',
        isActive: true
      },
      {
        gymId: primaryGym.id,
        name: 'Payment Declined Alert',
        type: 'PAYMENT_FAILED',
        channel: 'EMAIL',
        subject: 'Action Required: Your IronPulse payment was declined',
        body: 'Hi {{firstName}}, we were unable to process your payment of ${{amount}}. Please update your billing method to prevent uninterrupted facility access.',
        isActive: true
      },
      {
        gymId: primaryGym.id,
        name: 'Overdue Dues Notice',
        type: 'OVERDUE',
        channel: 'SMS',
        subject: null,
        body: 'IronPulse Alert: Your membership dues of ${{amount}} are past due. Please settle your account via the member portal.',
        isActive: true
      }
    ]
  });

  // 12. Audit Log
  await prisma.auditLog.create({
    data: {
      gymId: primaryGym.id,
      userId: superAdmin.id,
      action: 'DATABASE_CLEANED_AND_RESET',
      entity: 'System',
      metadata: {
        cleanedAt: new Date().toISOString(),
        initiatedBy: 'superadmin@gmail.com'
      }
    }
  });

  console.log('🎉 Database is now 100% clean, fresh, and properly configured!');
}

cleanAndResetDatabase()
  .catch((e) => {
    console.error('❌ Error during clean & reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
