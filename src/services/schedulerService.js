import cron from 'node-cron';
import prisma from '../prisma.js';
import recurringBillingService from './recurringBillingService.js';
import DunningService from './dunningService.js';

let recurringBillingTask = null;
let dunningTask = null;
let isRecurringRunning = false;
let isDunningRunning = false;
let lastRecurringRun = null;
let lastDunningRun = null;

/**
 * Execute Recurring Billing for all gyms or a specific gym tenant
 * Idempotent: checks existing invoices for cycle, prevents duplicate charges
 */
export async function runRecurringBillingJob(targetGymId = null) {
  if (isRecurringRunning) {
    console.warn('[SCHEDULER] Recurring billing job already in progress, skipping overlapping run.');
    return { status: 'SKIPPED', message: 'Job already in progress' };
  }

  isRecurringRunning = true;
  const startTime = new Date();
  const summary = {
    startedAt: startTime.toISOString(),
    gymsProcessed: 0,
    totalDue: 0,
    processed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const gyms = targetGymId
      ? await prisma.gym.findMany({ where: { id: targetGymId } })
      : await prisma.gym.findMany();

    for (const gym of gyms) {
      try {
        const result = await recurringBillingService.processDueRecurringBilling({ gymId: gym.id });
        summary.gymsProcessed++;
        summary.totalDue += result.totalDue || 0;
        summary.processed += result.processed || 0;
        summary.skipped += result.skipped || 0;
        if (result.errors && result.errors.length > 0) {
          summary.errors.push({ gymId: gym.id, errors: result.errors });
        }
      } catch (gymErr) {
        console.error(`[SCHEDULER] Error processing recurring billing for gym ${gym.id}:`, gymErr);
        summary.errors.push({ gymId: gym.id, error: gymErr.message });
      }
    }

    summary.completedAt = new Date().toISOString();
    summary.status = 'COMPLETED';
    lastRecurringRun = summary;
    console.log(`[SCHEDULER] Recurring billing completed: ${summary.processed} processed, ${summary.skipped} skipped across ${summary.gymsProcessed} gyms.`);
    return summary;
  } finally {
    isRecurringRunning = false;
  }
}

/**
 * Execute Dunning and overdue evaluations for all gyms or a specific gym tenant
 * Idempotent: evaluates retry cadence and prevents charging settled invoices
 */
export async function runDunningJob(targetGymId = null) {
  if (isDunningRunning) {
    console.warn('[SCHEDULER] Dunning job already in progress, skipping overlapping run.');
    return { status: 'SKIPPED', message: 'Job already in progress' };
  }

  isDunningRunning = true;
  const startTime = new Date();
  const summary = {
    startedAt: startTime.toISOString(),
    gymsProcessed: 0,
    failedPaymentsEvaluated: 0,
    upcomingRemindersSent: 0,
    overdueRemindersSent: 0,
    errors: []
  };

  try {
    const gyms = targetGymId
      ? await prisma.gym.findMany({ where: { id: targetGymId } })
      : await prisma.gym.findMany();

    for (const gym of gyms) {
      try {
        summary.gymsProcessed++;

        // 1. Process failed payments with eligible dunning retries
        const failedPayments = await prisma.payment.findMany({
          where: { gymId: gym.id, status: 'FAILED' }
        });

        for (const payment of failedPayments) {
          try {
            await DunningService.evaluateFailedPayment({
              gymId: gym.id,
              paymentId: payment.id,
              failureReason: payment.failureReason || 'Automated scheduler dunning run'
            });
            summary.failedPaymentsEvaluated++;
          } catch (evalErr) {
            summary.errors.push({ gymId: gym.id, paymentId: payment.id, error: evalErr.message });
          }
        }

        // 2. Process upcoming payment reminders
        try {
          const upcomingRes = await DunningService.processUpcomingPaymentReminders({ gymId: gym.id });
          summary.upcomingRemindersSent += upcomingRes.processedCount || 0;
        } catch (upErr) {
          summary.errors.push({ gymId: gym.id, type: 'UPCOMING_REMINDERS', error: upErr.message });
        }

        // 3. Process overdue payment reminders
        try {
          const overdueRes = await DunningService.processOverduePaymentReminders({ gymId: gym.id });
          summary.overdueRemindersSent += overdueRes.processedCount || 0;
        } catch (ovErr) {
          summary.errors.push({ gymId: gym.id, type: 'OVERDUE_REMINDERS', error: ovErr.message });
        }
      } catch (gymErr) {
        console.error(`[SCHEDULER] Error processing dunning for gym ${gym.id}:`, gymErr);
        summary.errors.push({ gymId: gym.id, error: gymErr.message });
      }
    }

    summary.completedAt = new Date().toISOString();
    summary.status = 'COMPLETED';
    lastDunningRun = summary;
    console.log(`[SCHEDULER] Dunning completed: ${summary.failedPaymentsEvaluated} failed payments evaluated, ${summary.upcomingRemindersSent} upcoming notices, ${summary.overdueRemindersSent} overdue notices across ${summary.gymsProcessed} gyms.`);
    return summary;
  } finally {
    isDunningRunning = false;
  }
}

/**
 * Initialize Node-Cron Scheduler
 * - Recurring Billing at 00:00 (Midnight)
 * - Dunning at 06:00 (Morning)
 */
export function initScheduler() {
  // If running inside test runner, do not attach timers unless explicitly requested
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[SCHEDULER] Background scheduler disabled in test or by configuration.');
    return;
  }

  // 1. Recurring Billing Schedule: Every day at 00:00 midnight
  recurringBillingTask = cron.schedule('0 0 * * *', async () => {
    console.log('[SCHEDULER] Executing daily Recurring Billing schedule (00:00)...');
    try {
      await runRecurringBillingJob();
    } catch (err) {
      console.error('[SCHEDULER] Recurring billing job failed:', err);
    }
  });

  // 2. Dunning Schedule: Every day at 06:00 AM
  dunningTask = cron.schedule('0 6 * * *', async () => {
    console.log('[SCHEDULER] Executing daily Dunning & Retry schedule (06:00)...');
    try {
      await runDunningJob();
    } catch (err) {
      console.error('[SCHEDULER] Dunning job failed:', err);
    }
  });

  console.log('[SCHEDULER] Initialized: Recurring billing (00:00 daily), Dunning (06:00 daily).');
}

/**
 * Stop scheduler tasks (useful for graceful shutdown and testing)
 */
export function stopScheduler() {
  if (recurringBillingTask) {
    recurringBillingTask.stop();
    recurringBillingTask = null;
  }
  if (dunningTask) {
    dunningTask.stop();
    dunningTask = null;
  }
  console.log('[SCHEDULER] Background scheduler stopped.');
}

/**
 * Get current scheduler health and last run timestamps
 */
export function getSchedulerStatus() {
  return {
    active: Boolean(recurringBillingTask || dunningTask),
    isRecurringRunning,
    isDunningRunning,
    lastRecurringRun,
    lastDunningRun,
    recurringCronPattern: '0 0 * * *',
    dunningCronPattern: '0 6 * * *'
  };
}

export default {
  initScheduler,
  stopScheduler,
  runRecurringBillingJob,
  runDunningJob,
  getSchedulerStatus
};
