import prisma from '../src/prisma.js';

async function migrateCurrency() {
  console.log('--- STARTING SAFE CURRENCY MIGRATION ---');

  // 1. Inspect existing table row counts
  const [plansCount, membershipsCount, invoicesCount, paymentsCount, recurringCount, gyms] = await Promise.all([
    prisma.membershipPlan.count(),
    prisma.membership.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.recurringBilling.count(),
    prisma.gym.findMany({ select: { id: true, tradeName: true, currency: true } })
  ]);

  console.log('Existing Records Baseline:');
  console.log(`- Membership Plans: ${plansCount}`);
  console.log(`- Memberships: ${membershipsCount}`);
  console.log(`- Invoices: ${invoicesCount}`);
  console.log(`- Payments: ${paymentsCount}`);
  console.log(`- Recurring Billings: ${recurringCount}`);
  console.log(`- Gyms: ${gyms.length} (${gyms.map(g => `${g.tradeName || g.id}: ${g.currency}`).join(', ')})`);

  // 2. Helper to check if column exists
  async function columnExists(table, column) {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${table}'
        AND COLUMN_NAME = '${column}'
    `);
    return Array.isArray(rows) && rows.length > 0;
  }

  // 3. Add currency column if missing
  const tables = ['membership_plans', 'memberships', 'invoices'];
  for (const table of tables) {
    const exists = await columnExists(table, 'currency');
    if (!exists) {
      console.log(`Adding missing 'currency' column to table '${table}'...`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE ${table}
        ADD COLUMN currency VARCHAR(191) NOT NULL DEFAULT 'USD'
      `);
      console.log(`✅ Column 'currency' added to '${table}'.`);
    } else {
      console.log(`ℹ️ Column 'currency' already exists on '${table}'.`);
    }
  }

  // 4. Safe backfill from parent Gym's operating currency
  console.log('Backfilling existing records from parent Gym currency...');

  const updatedPlans = await prisma.$executeRawUnsafe(`
    UPDATE membership_plans p
    INNER JOIN gyms g ON p.gymId = g.id
    SET p.currency = g.currency
  `);
  console.log(`✅ Synchronized ${updatedPlans} membership plans to parent gym currency.`);

  const updatedMemberships = await prisma.$executeRawUnsafe(`
    UPDATE memberships m
    INNER JOIN gyms g ON m.gymId = g.id
    SET m.currency = g.currency
  `);
  console.log(`✅ Synchronized ${updatedMemberships} memberships to parent gym currency.`);

  const updatedInvoices = await prisma.$executeRawUnsafe(`
    UPDATE invoices i
    INNER JOIN gyms g ON i.gymId = g.id
    SET i.currency = g.currency
  `);
  console.log(`✅ Synchronized ${updatedInvoices} invoices to parent gym currency.`);

  const updatedPolicies = await prisma.$executeRawUnsafe(`
    UPDATE billing_policies b
    INNER JOIN gyms g ON b.gymId = g.id
    SET b.currency = g.currency
  `);
  console.log(`✅ Synchronized ${updatedPolicies} billing policies to parent gym currency.`);

  const updatedPayments = await prisma.$executeRawUnsafe(`
    UPDATE payments p
    INNER JOIN gyms g ON p.gymId = g.id
    SET p.currency = g.currency
    WHERE p.currency = 'USD' OR p.currency IS NULL
  `);
  console.log(`✅ Synchronized ${updatedPayments} payments to parent gym currency.`);

  const updatedRecurring = await prisma.$executeRawUnsafe(`
    UPDATE recurring_billings r
    INNER JOIN gyms g ON r.gymId = g.id
    SET r.currency = g.currency
    WHERE r.currency = 'USD' OR r.currency IS NULL
  `);
  console.log(`✅ Synchronized ${updatedRecurring} recurring billing schedules to parent gym currency.`);

  // 5. Verify integrity after backfill
  const [plansAfter, membershipsAfter, invoicesAfter, paymentsAfter, recurringAfter] = await Promise.all([
    prisma.membershipPlan.count(),
    prisma.membership.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.recurringBilling.count()
  ]);

  if (
    plansAfter !== plansCount ||
    membershipsAfter !== membershipsCount ||
    invoicesAfter !== invoicesCount ||
    paymentsAfter !== paymentsCount ||
    recurringAfter !== recurringCount
  ) {
    throw new Error('Integrity check failed: Row counts mismatch before and after migration!');
  }

  console.log('✅ INTEGRITY VERIFIED: All row counts match exactly baseline.');
  console.log('--- SAFE CURRENCY MIGRATION COMPLETE ---');

  await prisma.$disconnect();
}

migrateCurrency().catch(async (err) => {
  console.error('Fatal migration error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
