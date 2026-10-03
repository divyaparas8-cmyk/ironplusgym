import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import app from '../src/server.js';
import prisma from '../src/prisma.js';
import { generateToken } from '../src/utils/jwt.js';

describe('SUPER ADMIN & SAAS GYM SUBSCRIPTION TEST SUITE', () => {
  let server;
  let baseUrl;
  let superAdminToken;
  let superAdminUser;
  let gymA;
  let gymB;
  let gymAOwner;
  let gymBOwner;
  let gymAToken;
  let gymBToken;
  let testPlan;

  before(async () => {
    // Start ephemeral test server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 1. Create or ensure Test SaaS Plan
    testPlan = await prisma.gymSubscriptionPlan.upsert({
      where: { id: 'test-plan-growth' },
      update: {},
      create: {
        id: 'test-plan-growth',
        name: 'Growth SaaS Test Plan',
        description: 'Test subscription plan for gyms',
        monthlyPrice: 99.00,
        yearlyPrice: 990.00,
        currency: 'USD',
        trialDays: 14,
        gracePeriodDays: 7,
        featureList: ['Feature 1', 'Feature 2'],
        isActive: true
      }
    });

    // 2. Create Platform Super Admin
    const saPasswordHash = await bcrypt.hash('SuperAdminPass2026!', 10);
    superAdminUser = await prisma.user.upsert({
      where: { id: 'sa-user-0001' },
      update: { role: 'SUPER_ADMIN' },
      create: {
        id: 'sa-user-0001',
        gymId: null,
        name: 'Platform Super Admin',
        email: 'testsuperadmin@ironpulse.club',
        passwordHash: saPasswordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      }
    });

    superAdminToken = generateToken({
      userId: superAdminUser.id,
      gymId: null,
      role: 'SUPER_ADMIN'
    });

    // 3. Create Gym A & Owner
    gymA = await prisma.gym.upsert({
      where: { id: 'gym-tenant-a-0001' },
      update: {},
      create: {
        id: 'gym-tenant-a-0001',
        legalName: 'Gym Alpha Tenant',
        tradeName: 'Alpha Fitness Club',
        contactEmail: 'owner@gymalpha.io',
        currency: 'USD'
      }
    });

    const gymAOwnerHash = await bcrypt.hash('GymOwnerPass2026!', 10);
    gymAOwner = await prisma.user.upsert({
      where: { id: 'user-gym-a-0001' },
      update: {},
      create: {
        id: 'user-gym-a-0001',
        gymId: gymA.id,
        name: 'Alpha Owner',
        email: 'owner@gymalpha.io',
        passwordHash: gymAOwnerHash,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });

    gymAToken = generateToken({
      userId: gymAOwner.id,
      gymId: gymA.id,
      role: 'OWNER'
    });

    // Create Active Subscription for Gym A
    await prisma.gymSubscription.upsert({
      where: { gymId: gymA.id },
      update: { status: 'ACTIVE' },
      create: {
        gymId: gymA.id,
        planId: testPlan.id,
        status: 'ACTIVE',
        price: 99.00,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        gracePeriodEnd: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000)
      }
    });

    // 4. Create Gym B & Owner
    gymB = await prisma.gym.upsert({
      where: { id: 'gym-tenant-b-0001' },
      update: {},
      create: {
        id: 'gym-tenant-b-0001',
        legalName: 'Gym Beta Tenant',
        tradeName: 'Beta Performance Lab',
        contactEmail: 'owner@gymbeta.io',
        currency: 'USD'
      }
    });

    const gymBOwnerHash = await bcrypt.hash('GymOwnerPass2026!', 10);
    gymBOwner = await prisma.user.upsert({
      where: { id: 'user-gym-b-0001' },
      update: {},
      create: {
        id: 'user-gym-b-0001',
        gymId: gymB.id,
        name: 'Beta Owner',
        email: 'owner@gymbeta.io',
        passwordHash: gymBOwnerHash,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });

    gymBToken = generateToken({
      userId: gymBOwner.id,
      gymId: gymB.id,
      role: 'OWNER'
    });

    // Create Expired Subscription for Gym B
    await prisma.gymSubscription.upsert({
      where: { gymId: gymB.id },
      update: { status: 'EXPIRED' },
      create: {
        gymId: gymB.id,
        planId: testPlan.id,
        status: 'EXPIRED',
        price: 99.00,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        gracePeriodEnd: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      }
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ---------------------------------------------------------------------------
  // 1 & 2: Super Admin Authentication & Access Isolation
  // ---------------------------------------------------------------------------
  it('1. Super Admin can authenticate and access /api/auth/me without gymId requirement', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.role, 'SUPER_ADMIN');
    assert.strictEqual(data.data.gymId, null);
  });

  it('2. Normal gym admin cannot access Super Admin endpoints (returns 403)', async () => {
    const res = await fetch(`${baseUrl}/api/super-admin/dashboard`, {
      headers: { Authorization: `Bearer ${gymAToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
  });

  // ---------------------------------------------------------------------------
  // 3 & 4: Super Admin Dashboard & Gym Management
  // ---------------------------------------------------------------------------
  it('3. Super Admin can view platform dashboard with real computed metrics', async () => {
    const res = await fetch(`${baseUrl}/api/super-admin/dashboard`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalGyms === 'number');
    assert.ok(typeof data.data.mrr === 'number');
    assert.ok(typeof data.data.subscriptionRevenue === 'number');
  });

  it('4. Super Admin can list all gyms and filter by subscription status', async () => {
    const res = await fetch(`${baseUrl}/api/super-admin/gyms`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 2);
  });

  it('5. Super Admin can view SaaS subscription plans and create a new plan', async () => {
    const getRes = await fetch(`${baseUrl}/api/super-admin/subscription-plans`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const getData = await getRes.json();

    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getData.success, true);
    assert.ok(Array.isArray(getData.data));

    // Create a plan
    const createRes = await fetch(`${baseUrl}/api/super-admin/subscription-plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Enterprise VIP Test Plan',
        description: 'Multi-location elite support',
        monthlyPrice: 299.00,
        yearlyPrice: 2990.00,
        currency: 'USD',
        trialDays: 30,
        gracePeriodDays: 14,
        featureList: ['Unlimited Roster', '24/7 Hotline']
      })
    });
    const createData = await createRes.json();

    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createData.success, true);
    assert.strictEqual(createData.data.name, 'Enterprise VIP Test Plan');
  });

  // ---------------------------------------------------------------------------
  // 6 & 7: Access Control Middleware (Active vs Expired)
  // ---------------------------------------------------------------------------
  it('6. Gym with ACTIVE subscription can access protected tenant routes', async () => {
    const res = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${gymAToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
  });

  it('7. Gym with EXPIRED subscription is BLOCKED with 403 SUBSCRIPTION_REQUIRED', async () => {
    const res = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${gymBToken}` }
    });
    const data = await res.json();

    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, 'SUBSCRIPTION_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 8 & 9: Renewal and Grace Period
  // ---------------------------------------------------------------------------
  it('8. Expired Gym can still access subscription renewal endpoint and restore access', async () => {
    // 1. Can view subscription status even when expired
    const statusRes = await fetch(`${baseUrl}/api/subscription`, {
      headers: { Authorization: `Bearer ${gymBToken}` }
    });
    const statusData = await statusRes.json();

    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusData.success, true);
    assert.strictEqual(statusData.data.status, 'EXPIRED');

    // 2. Renew subscription
    const renewRes = await fetch(`${baseUrl}/api/subscription/renew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gymBToken}`
      },
      body: JSON.stringify({
        planId: testPlan.id,
        billingInterval: 'MONTHLY',
        paymentMethodId: 'pm_card_visa'
      })
    });
    const renewData = await renewRes.json();

    assert.strictEqual(renewRes.status, 200);
    assert.strictEqual(renewData.success, true);
    assert.strictEqual(renewData.data.subscription.status, 'ACTIVE');

    // 3. Verify access is restored to members API
    const accessRestoredRes = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${gymBToken}` }
    });
    const accessData = await accessRestoredRes.json();

    assert.strictEqual(accessRestoredRes.status, 200);
    assert.strictEqual(accessData.success, true);
  });

  it('9. Subscription lifecycle correctly enforces grace period for PAST_DUE gyms', async () => {
    // Set Gym B to PAST_DUE with future gracePeriodEnd
    await prisma.gymSubscription.update({
      where: { gymId: gymB.id },
      data: {
        status: 'PAST_DUE',
        gracePeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      }
    });

    const res = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${gymBToken}` }
    });

    // Access allowed during grace period with warning header
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-subscription-status'), 'GRACE_PERIOD');
  });

  // ---------------------------------------------------------------------------
  // 10: Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  it('10. Multi-tenant isolation: Gym A cannot access Gym B records', async () => {
    // Create member in Gym B
    const memberB = await prisma.member.upsert({
      where: { id: 'member-b-isolated-001' },
      update: {},
      create: {
        id: 'member-b-isolated-001',
        gymId: gymB.id,
        memberId: 'MEM-B-001',
        firstName: 'BetaMember',
        lastName: 'IsolationTest',
        email: 'isolated@gymbeta.io'
      }
    });

    // Request memberB using Gym A token
    const res = await fetch(`${baseUrl}/api/members/${memberB.id}`, {
      headers: { Authorization: `Bearer ${gymAToken}` }
    });

    assert.strictEqual(res.status, 404);
  });
});
