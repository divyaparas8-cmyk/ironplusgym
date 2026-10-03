import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDb() {
  console.log('🔍 ================= DB INTEGRITY & DATA AUDIT =================');
  
  // 1. Check SuperAdmin and Users
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, gymId: true, status: true }
  });
  console.log(`\n👥 USERS TABLE (Total: ${users.length}):`);
  users.forEach(u => console.log(`  • [${u.role}] ${u.name} (${u.email}) - Status: ${u.status} | GymId: ${u.gymId || 'N/A'}`));

  // 2. Check Gyms
  const gyms = await prisma.gym.findMany({
    include: {
      membershipPlans: { select: { id: true, name: true, price: true, billingFrequency: true, isActive: true } },
      subscription: { include: { plan: true } },
      _count: {
        select: {
          members: true,
          invoices: true,
          payments: true,
          subscriptionInvoices: true,
          paymentProviders: true,
          integrationSettings: true,
          users: true,
          membershipPlans: true
        }
      }
    }
  });
  console.log(`\n🏢 GYMS TABLE (Total: ${gyms.length}):`);
  gyms.forEach(g => {
    console.log(`  • Gym: "${g.legalName}" / Trade: "${g.tradeName || 'N/A'}" (ID: ${g.id})`);
    console.log(`    - Currency: ${g.currency} | Timezone: ${g.timezone} | PaymentMode: ${g.paymentMode}`);
    console.log(`    - SaaS Subscription: ${g.subscription ? `${g.subscription.plan?.name} (${g.subscription.status})` : 'None'}`);
    console.log(`    - Enrolled Members: ${g._count.members}`);
    console.log(`    - Invoices: ${g._count.invoices}`);
    console.log(`    - Payments: ${g._count.payments}`);
    console.log(`    - Payment Providers: ${g._count.paymentProviders}`);
    console.log(`    - Integration Settings: ${g._count.integrationSettings}`);
    console.log(`    - Membership Plans (${g.membershipPlans.length}):`);
    g.membershipPlans.forEach(p => console.log(`      * ${p.name} ($${p.price} / ${p.billingFrequency}) - Active: ${p.isActive}`));
  });

  // 3. Platform SaaS Subscription Plans (For SuperAdmin)
  const platformPlans = await prisma.gymSubscriptionPlan.findMany();
  console.log(`\n📦 SAAS PLATFORM SUBSCRIPTION PLANS (Total: ${platformPlans.length}):`);
  platformPlans.forEach(p => console.log(`  • ${p.name} ($${p.monthlyPrice}/mo, $${p.yearlyPrice || 0}/yr) - Active: ${p.isActive}`));

  // 4. Custom QR Config Check
  const qrProviders = await prisma.paymentProvider.findMany({
    where: { provider: 'CUSTOM_QR' }
  });
  console.log(`\n📱 CUSTOM QR CONFIGURATIONS (Total: ${qrProviders.length}):`);
  qrProviders.forEach(q => {
    const cfg = q.config || {};
    console.log(`  • GymId: ${q.gymId} | Status: ${q.status} | Has QR URL: ${Boolean(cfg.qrCodeUrl)} | Display Name: "${cfg.displayName || 'N/A'}" | UPI: ${cfg.upiId || 'N/A'}`);
  });

  // 5. Total counts across all tables
  const counts = {
    gyms: await prisma.gym.count(),
    users: await prisma.user.count(),
    members: await prisma.member.count(),
    memberships: await prisma.membership.count(),
    membershipPlans: await prisma.membershipPlan.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    paymentMethods: await prisma.paymentMethod.count(),
    gymSubscriptions: await prisma.gymSubscription.count(),
    gymSubscriptionPlans: await prisma.gymSubscriptionPlan.count(),
    paymentProviders: await prisma.paymentProvider.count(),
    integrationSettings: await prisma.integrationSetting.count(),
    billingPolicies: await prisma.billingPolicy.count(),
    auditLogs: await prisma.auditLog.count()
  };

  console.log('\n📊 ALL DATABASE TABLES STATUS & RECORD COUNTS:');
  console.table(counts);
  console.log('✅ ================= AUDIT FINISHED SUCCESSFULLY =================');
  await prisma.$disconnect();
}

checkDb().catch(async (e) => {
  console.error('❌ DB Audit Error:', e);
  await prisma.$disconnect();
});
