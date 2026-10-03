import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/prisma.js';
import settingsService from '../src/services/settingsService.js';
import paymentService from '../src/services/paymentService.js';

describe('PAYMENT ARCHITECTURE: CASH, QR, AND TENANT ISOLATION TESTS', () => {
  let gymA;
  let gymB;
  let userA;
  let memberA;
  let memberB;
  let invoiceA;

  before(async () => {
    // 1. Create Gym A and Gym B
    gymA = await prisma.gym.create({
      data: {
        legalName: 'Test Gym A Legal LLC',
        tradeName: 'Test Gym A',
        contactEmail: `gym-a-${Date.now()}@example.com`
      }
    });

    gymB = await prisma.gym.create({
      data: {
        legalName: 'Test Gym B Legal LLC',
        tradeName: 'Test Gym B',
        contactEmail: `gym-b-${Date.now()}@example.com`
      }
    });

    // 2. Create User for Gym A
    userA = await prisma.user.create({
      data: {
        gymId: gymA.id,
        name: 'Admin Gym A',
        email: `admin-a-${Date.now()}@example.com`,
        passwordHash: 'hash123',
        role: 'ADMIN'
      }
    });

    // 3. Create Member for Gym A and Member for Gym B
    memberA = await prisma.member.create({
      data: {
        gymId: gymA.id,
        memberId: `MEM-A-${Date.now().toString().slice(-4)}`,
        firstName: 'John',
        lastName: 'Doe',
        email: `john-${Date.now()}@example.com`,
        status: 'ACTIVE'
      }
    });

    memberB = await prisma.member.create({
      data: {
        gymId: gymB.id,
        memberId: `MEM-B-${Date.now().toString().slice(-4)}`,
        firstName: 'Jane',
        lastName: 'Smith',
        email: `jane-${Date.now()}@example.com`,
        status: 'ACTIVE'
      }
    });

    // 4. Create Invoice for Member A
    invoiceA = await prisma.invoice.create({
      data: {
        gymId: gymA.id,
        memberId: memberA.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        subtotal: 100.0,
        tax: 0.0,
        total: 100.0,
        status: 'OPEN',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  });

  after(async () => {
    // Cleanup created test records
    try {
      if (invoiceA?.id) {
        await prisma.paymentAttempt.deleteMany({ where: { gymId: gymA.id } });
        await prisma.payment.deleteMany({ where: { gymId: gymA.id } });
        await prisma.invoice.deleteMany({ where: { gymId: gymA.id } });
      }
      if (memberA?.id) await prisma.member.deleteMany({ where: { id: memberA.id } });
      if (memberB?.id) await prisma.member.deleteMany({ where: { id: memberB.id } });
      if (userA?.id) await prisma.user.deleteMany({ where: { id: userA.id } });
      await prisma.paymentProvider.deleteMany({ where: { gymId: { in: [gymA.id, gymB.id] } } });
      await prisma.auditLog.deleteMany({ where: { gymId: { in: [gymA.id, gymB.id] } } });
      if (gymA?.id) await prisma.gym.delete({ where: { id: gymA.id } });
      if (gymB?.id) await prisma.gym.delete({ where: { id: gymB.id } });
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  // TEST 1: Gym Admin uploads QR
  it('TEST 1: Gym Admin uploads member payment QR successfully', async () => {
    const result = await settingsService.updatePaymentQr(gymA.id, {
      qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      upiId: 'testgym@upi',
      displayName: 'Test Gym A Counter',
      instructions: 'Scan and pay dues at front desk'
    });

    assert.ok(result);
    assert.strictEqual(result.isConfigured, true);
    assert.strictEqual(result.upiId, 'testgym@upi');
    assert.strictEqual(result.displayName, 'Test Gym A Counter');
  });

  // TEST 2: Gym Admin retrieves and replaces QR
  it('TEST 2: Gym Admin retrieves and replaces QR code', async () => {
    // Retrieve
    const fetched = await settingsService.getPaymentQr(gymA.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.upiId, 'testgym@upi');

    // Replace
    const updated = await settingsService.updatePaymentQr(gymA.id, {
      qrCodeUrl: 'data:image/png;base64,updated_qr_image_data',
      upiId: 'newhandle@upi',
      displayName: 'Test Gym A Counter V2'
    });

    assert.strictEqual(updated.upiId, 'newhandle@upi');
    assert.strictEqual(updated.displayName, 'Test Gym A Counter V2');
  });

  // TEST 3: Gym Admin deletes QR
  it('TEST 3: Gym Admin deletes QR code successfully', async () => {
    const deleteResult = await settingsService.deletePaymentQr(gymA.id);
    assert.strictEqual(deleteResult.isConfigured, false);
    assert.strictEqual(deleteResult.qrCodeUrl, null);

    const reFetch = await settingsService.getPaymentQr(gymA.id);
    assert.strictEqual(reFetch.isConfigured, false);
    assert.strictEqual(reFetch.qrCodeUrl, null);
  });

  // TEST 4: Gym Admin records CASH payment
  it('TEST 4: Gym Admin records CASH member payment (Stripe is NOT called)', async () => {
    const paymentRecord = await paymentService.recordMemberPayment({
      gymId: gymA.id,
      userId: userA.id,
      memberId: memberA.id,
      invoiceId: invoiceA.id,
      amount: 100.0,
      paymentMethodType: 'CASH',
      settlementReference: 'CASH-REF-001',
      notes: 'Cash payment at front desk'
    });

    assert.ok(paymentRecord);
    assert.strictEqual(paymentRecord.status, 'PAID');
    assert.strictEqual(paymentRecord.paymentMethodType, 'CASH');
    assert.strictEqual(paymentRecord.provider, 'CASH');
    assert.strictEqual(Number(paymentRecord.amount), 100.0);

    // Verify invoice status is updated to PAID
    const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoiceA.id } });
    assert.strictEqual(updatedInvoice.status, 'PAID');
    assert.ok(updatedInvoice.paidAt !== null);

    // Verify PaymentAttempt was created with SUCCESS
    const attempt = await prisma.paymentAttempt.findFirst({
      where: { paymentId: paymentRecord.id }
    });
    assert.ok(attempt);
    assert.strictEqual(attempt.status, 'SUCCESS');

    // Verify Audit Log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        gymId: gymA.id,
        entityId: paymentRecord.id,
        action: 'MEMBER_CASH_PAYMENT_RECORDED'
      }
    });
    assert.ok(auditLog);
    assert.strictEqual(auditLog.userId, userA.id);
  });

  // TEST 5: Gym Admin records QR payment
  it('TEST 5: Gym Admin records QR member payment with manual admin verification', async () => {
    // Create new invoice for member A
    const invoiceA2 = await prisma.invoice.create({
      data: {
        gymId: gymA.id,
        memberId: memberA.id,
        invoiceNumber: `INV-QR-${Date.now()}`,
        subtotal: 75.0,
        tax: 0.0,
        total: 75.0,
        status: 'OPEN',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const paymentRecord = await paymentService.recordMemberPayment({
      gymId: gymA.id,
      userId: userA.id,
      memberId: memberA.id,
      invoiceId: invoiceA2.id,
      amount: 75.0,
      paymentMethodType: 'QR',
      settlementReference: 'UPI-TXN-987654321',
      notes: 'Scanned counter QR code and verified by staff'
    });

    assert.ok(paymentRecord);
    assert.strictEqual(paymentRecord.status, 'PAID');
    assert.strictEqual(paymentRecord.provider, 'QR_CODE');
    assert.strictEqual(Number(paymentRecord.amount), 75.0);

    // Verify invoice status is updated to PAID
    const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoiceA2.id } });
    assert.strictEqual(updatedInvoice.status, 'PAID');

    // Verify Audit Log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        gymId: gymA.id,
        entityId: paymentRecord.id,
        action: 'MEMBER_QR_PAYMENT_RECORDED'
      }
    });
    assert.ok(auditLog);
  });

  // TEST 6: Tenant isolation — Gym A cannot access Gym B QR
  it('TEST 6: Tenant isolation — Gym B has separate QR and cannot see Gym A QR', async () => {
    // Setup QR for Gym B
    await settingsService.updatePaymentQr(gymB.id, {
      qrCodeUrl: 'data:image/png;base64,gym_b_qr_data',
      upiId: 'gymB@upi',
      displayName: 'Gym B Exclusive QR'
    });

    // Fetch for Gym A
    const qrA = await settingsService.getPaymentQr(gymA.id);
    // Fetch for Gym B
    const qrB = await settingsService.getPaymentQr(gymB.id);

    assert.notStrictEqual(qrA.upiId, qrB.upiId);
    assert.strictEqual(qrB.displayName, 'Gym B Exclusive QR');
  });

  // TEST 7: Tenant isolation — Cross-gym member payment is rejected
  it('TEST 7: Tenant isolation — Reject cross-gym member payment (Gym A user trying to pay Gym B member)', async () => {
    await assert.rejects(
      async () => {
        await paymentService.recordMemberPayment({
          gymId: gymA.id,
          userId: userA.id,
          memberId: memberB.id, // Belongs to Gym B
          amount: 50.0,
          paymentMethodType: 'CASH'
        });
      },
      (err) => {
        assert.ok(err.statusCode === 404 || err.message.includes('not found'));
        return true;
      }
    );
  });

  // TEST 8: Validation — Invalid amount is rejected
  it('TEST 8: Validation — Rejects payment with zero or negative amount', async () => {
    await assert.rejects(
      async () => {
        await paymentService.recordMemberPayment({
          gymId: gymA.id,
          userId: userA.id,
          memberId: memberA.id,
          amount: 0,
          paymentMethodType: 'CASH'
        });
      },
      (err) => {
        assert.ok(err.statusCode === 400 || err.message.includes('Amount'));
        return true;
      }
    );
  });
});
