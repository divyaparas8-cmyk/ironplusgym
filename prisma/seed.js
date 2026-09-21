import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding IronPulse Database...');

  // 1. Create or update Default Gym
  const gym = await prisma.gym.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      legalName: 'IronPulse Fitness Inc.',
      tradeName: 'IronPulse Athletic Club & Performance Lab',
      contactEmail: 'billing@ironpulse.club',
      phone: '+1 (512) 890-4400',
      address: '450 Spartan Way, Suite 100',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'United States',
      timezone: 'America/Chicago',
      currency: 'USD',
      logoUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=160&auto=format&fit=crop&q=80',
      website: 'https://ironpulse.club'
    }
  });

  console.log(`✅ Gym verified: ${gym.tradeName} (${gym.id})`);

  // 2. Create Default Gym Owner User (Credentials: owner@ironpulse.club / IronPulse2026!)
  const ownerPasswordHash = bcrypt.hashSync('IronPulse2026!', 10);
  const ownerUser = await prisma.user.upsert({
    where: {
      gymId_email: {
        gymId: gym.id,
        email: 'owner@ironpulse.club'
      }
    },
    update: {
      passwordHash: ownerPasswordHash
    },
    create: {
      gymId: gym.id,
      name: 'IronPulse Owner',
      email: 'owner@ironpulse.club',
      passwordHash: ownerPasswordHash,
      role: 'OWNER',
      status: 'ACTIVE'
    }
  });

  console.log(`✅ Owner User verified: ${ownerUser.email}`);

  // 3. Billing Policy
  await prisma.billingPolicy.upsert({
    where: { gymId: gym.id },
    update: {},
    create: {
      gymId: gym.id,
      defaultGracePeriodDays: 5,
      retryCadenceDays: [1, 3, 5, 7],
      latePaymentFee: 15.00,
      salesTaxPercentage: 8.50,
      currency: 'USD'
    }
  });

  console.log(`✅ Billing policy configured (Grace: 5 days, Retries: [1, 3, 5, 7])`);

  // 4. Membership Plans
  const plans = [
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

  for (const plan of plans) {
    await prisma.membershipPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: {
        id: plan.id,
        gymId: gym.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        billingFrequency: plan.billingFrequency,
        featureList: plan.featureList,
        isActive: true
      }
    });
  }

  console.log(`✅ ${plans.length} Membership plans seeded.`);

  // 5. Payment Provider
  await prisma.paymentProvider.upsert({
    where: {
      gymId_provider: {
        gymId: gym.id,
        provider: 'STRIPE'
      }
    },
    update: {},
    create: {
      gymId: gym.id,
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

  // 6. Integration Settings
  const integrations = [
    { provider: 'TWILIO_SMS', isEnabled: true, config: { senderId: 'IRONPULSE', fromNumber: '+15128904400' } },
    { provider: 'SENDGRID_EMAIL', isEnabled: true, config: { fromEmail: 'billing@ironpulse.club', fromName: 'IronPulse Club' } },
    { provider: 'WHATSAPP_API', isEnabled: false, config: { businessNumber: null } }
  ];

  for (const integ of integrations) {
    await prisma.integrationSetting.upsert({
      where: {
        gymId_provider: {
          gymId: gym.id,
          provider: integ.provider
        }
      },
      update: {},
      create: {
        gymId: gym.id,
        provider: integ.provider,
        isEnabled: integ.isEnabled,
        config: integ.config
      }
    });
  }

  // 7. Notification Templates
  const templates = [
    {
      name: 'Upcoming Payment Notice',
      type: 'UPCOMING_PAYMENT',
      channel: 'EMAIL',
      subject: 'IronPulse Courtesy Notice: Dues scheduled for processing',
      body: 'Hi {{firstName}}, this is a courtesy reminder that your dues of ${{amount}} for {{planName}} are scheduled for {{dueDate}}.'
    },
    {
      name: 'Payment Declined Alert',
      type: 'PAYMENT_FAILED',
      channel: 'EMAIL',
      subject: 'Action Required: Your IronPulse payment was declined',
      body: 'Hi {{firstName}}, we were unable to process your payment of ${{amount}}. Please update your billing method to prevent uninterrupted facility access.'
    },
    {
      name: 'Overdue Dues Notice',
      type: 'OVERDUE',
      channel: 'SMS',
      subject: null,
      body: 'IronPulse Alert: Your membership dues of ${{amount}} are past due. Please settle your account via the member portal.'
    }
  ];

  for (const tmpl of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        gymId_name: {
          gymId: gym.id,
          name: tmpl.name
        }
      },
      update: {},
      create: {
        gymId: gym.id,
        name: tmpl.name,
        type: tmpl.type,
        channel: tmpl.channel,
        subject: tmpl.subject,
        body: tmpl.body,
        isActive: true
      }
    });
  }

  // 8. Sample Member & Initial Billing Records
  const sampleMember = await prisma.member.upsert({
    where: {
      gymId_memberId: {
        gymId: gym.id,
        memberId: 'MEM-8021'
      }
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      gymId: gym.id,
      memberId: 'MEM-8021',
      firstName: 'Marcus',
      lastName: 'Vance',
      email: 'marcus.vance@fitlife.io',
      phone: '+1 (555) 234-8901',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      emergencyContact: 'Diana Vance (+1 555-234-8902)',
      status: 'ACTIVE',
      notes: 'Direct recurring draft on file. Prefers email receipts.'
    }
  });

  const memberPaymentMethod = await prisma.paymentMethod.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      gymId: gym.id,
      memberId: sampleMember.id,
      provider: 'STRIPE',
      providerPaymentMethodId: 'pm_1NXYZ9012Mastercard',
      type: 'CARD',
      brand: 'Mastercard',
      last4: '9012',
      expMonth: 12,
      expYear: 2028,
      isDefault: true,
      status: 'ACTIVE'
    }
  });

  const membership = await prisma.membership.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      gymId: gym.id,
      memberId: sampleMember.id,
      planId: 'PLAN-VIP',
      status: 'ACTIVE',
      price: 199.00,
      billingFrequency: 'MONTHLY',
      startDate: new Date('2023-01-15'),
      nextBillingDate: new Date('2026-09-22')
    }
  });

  await prisma.recurringBilling.upsert({
    where: { membershipId: membership.id },
    update: {},
    create: {
      gymId: gym.id,
      memberId: sampleMember.id,
      membershipId: membership.id,
      provider: 'STRIPE',
      providerSubscriptionId: 'sub_1NXYZ_VipAthlete',
      amount: 199.00,
      currency: 'USD',
      billingFrequency: 'MONTHLY',
      nextBillingDate: new Date('2026-09-22'),
      status: 'ACTIVE'
    }
  });

  const invoice = await prisma.invoice.upsert({
    where: {
      gymId_invoiceNumber: {
        gymId: gym.id,
        invoiceNumber: 'INV-2026-0941'
      }
    },
    update: {},
    create: {
      gymId: gym.id,
      memberId: sampleMember.id,
      membershipId: membership.id,
      invoiceNumber: 'INV-2026-0941',
      subtotal: 199.00,
      tax: 0.00,
      total: 199.00,
      dueDate: new Date('2026-09-15'),
      status: 'PAID',
      paidAt: new Date('2026-09-15T08:30:18Z')
    }
  });

  const payment = await prisma.payment.upsert({
    where: { id: '00000000-0000-0000-0000-000000000040' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000040',
      gymId: gym.id,
      memberId: sampleMember.id,
      membershipId: membership.id,
      invoiceId: invoice.id,
      paymentMethodId: memberPaymentMethod.id,
      provider: 'STRIPE',
      providerPaymentId: 'ch_3NX8849LkJ92Paid',
      amount: 199.00,
      currency: 'USD',
      status: 'PAID',
      paymentMethodType: 'CARD',
      transactionDate: new Date('2026-09-15T08:30:12Z'),
      settledDate: new Date('2026-09-15T08:30:18Z')
    }
  });

  await prisma.paymentAttempt.create({
    data: {
      paymentId: payment.id,
      attemptNumber: 1,
      attemptedAt: new Date('2026-09-15T08:30:15Z'),
      status: 'SUCCESS',
      providerResponse: {
        chargeId: 'ch_3NX8849LkJ92Paid',
        authCode: 'AUTH_OK_9012'
      }
    }
  });

  // Audit Log entry
  await prisma.auditLog.create({
    data: {
      gymId: gym.id,
      userId: ownerUser.id,
      action: 'SYSTEM_DATABASE_SEEDED',
      entity: 'System',
      metadata: {
        source: 'prisma/seed.js',
        seededAt: new Date().toISOString()
      }
    }
  });

  console.log(`✅ Sample member (${sampleMember.memberId}), membership, invoice, and payment seeded.`);
  console.log('🎉 IronPulse database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
