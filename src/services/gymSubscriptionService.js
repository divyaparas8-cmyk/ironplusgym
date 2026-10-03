import prisma from '../prisma.js';

export class GymSubscriptionService {
  /**
   * Get or evaluate the live subscription status of a Gym
   */
  static async getGymSubscription(gymId) {
    if (!gymId) return null;

    let subscription = await prisma.gymSubscription.findUnique({
      where: { gymId },
      include: {
        plan: true
      }
    });

    if (!subscription) {
      // Auto-provision trial subscription if gym exists without subscription record
      subscription = await this.createTrialSubscription(gymId);
    } else {
      // Dynamically evaluate and persist lifecycle transitions
      subscription = await this.evaluateSubscriptionLifecycle(subscription);
    }

    return subscription;
  }

  /**
   * Evaluate and transition subscription state based on current time
   */
  static async evaluateSubscriptionLifecycle(subscription) {
    const now = new Date();
    let newStatus = subscription.status;
    let needsUpdate = false;

    if (subscription.status === 'TRIALING') {
      const trialExpired = subscription.trialEnd && now > new Date(subscription.trialEnd);
      if (trialExpired) {
        // Check grace period
        if (subscription.gracePeriodEnd && now <= new Date(subscription.gracePeriodEnd)) {
          newStatus = 'GRACE_PERIOD';
          needsUpdate = true;
        } else {
          newStatus = 'EXPIRED';
          needsUpdate = true;
        }
      }
    } else if (subscription.status === 'ACTIVE') {
      const periodEnded = subscription.currentPeriodEnd && now > new Date(subscription.currentPeriodEnd);
      if (periodEnded) {
        if (subscription.gracePeriodEnd && now <= new Date(subscription.gracePeriodEnd)) {
          newStatus = 'PAST_DUE';
          needsUpdate = true;
        } else {
          newStatus = 'EXPIRED';
          needsUpdate = true;
        }
      }
    } else if (subscription.status === 'PAST_DUE' || subscription.status === 'GRACE_PERIOD') {
      const graceExpired = subscription.gracePeriodEnd && now > new Date(subscription.gracePeriodEnd);
      if (graceExpired) {
        newStatus = 'EXPIRED';
        needsUpdate = true;
      }
    } else if (subscription.status === 'CANCELLED') {
      const periodEnded = subscription.currentPeriodEnd && now > new Date(subscription.currentPeriodEnd);
      if (periodEnded) {
        newStatus = 'EXPIRED';
        needsUpdate = true;
      }
    }

    if (needsUpdate && newStatus !== subscription.status) {
      subscription = await prisma.gymSubscription.update({
        where: { id: subscription.id },
        data: { status: newStatus },
        include: { plan: true }
      });

      // Record audit log for status change
      await prisma.auditLog.create({
        data: {
          gymId: subscription.gymId,
          action: 'GYM_SUBSCRIPTION_STATUS_UPDATED',
          entity: 'GymSubscription',
          entityId: subscription.id,
          metadata: {
            previousStatus: subscription.status,
            newStatus,
            evaluatedAt: now.toISOString()
          }
        }
      }).catch(() => {});
    }

    return subscription;
  }

  /**
   * Provision a default 14-day trial subscription for a new Gym
   */
  static async createTrialSubscription(gymId, planId = null) {
    let plan = null;
    if (planId) {
      plan = await prisma.gymSubscriptionPlan.findUnique({ where: { id: planId } });
    }
    if (!plan) {
      plan = await prisma.gymSubscriptionPlan.findFirst({
        where: { isActive: true },
        orderBy: { monthlyPrice: 'asc' }
      });
    }

    const trialDays = plan?.trialDays || 14;
    const gracePeriodDays = plan?.gracePeriodDays || 7;

    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const gracePeriodEnd = new Date(trialEnd.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    const subscription = await prisma.gymSubscription.upsert({
      where: { gymId },
      update: {},
      create: {
        gymId,
        planId: plan?.id || null,
        status: 'TRIALING',
        price: plan ? plan.monthlyPrice : 0,
        currency: plan ? plan.currency : 'USD',
        billingInterval: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialStart: now,
        trialEnd: trialEnd,
        gracePeriodEnd: gracePeriodEnd
      },
      include: {
        plan: true
      }
    });

    return subscription;
  }

  /**
   * Check if a Gym currently has active platform access
   */
  static async isGymAccessAllowed(gymId) {
    const subscription = await this.getGymSubscription(gymId);
    if (!subscription) return { allowed: false, reason: 'NO_SUBSCRIPTION', subscription: null };

    const now = new Date();

    if (subscription.status === 'ACTIVE') {
      return { allowed: true, status: 'ACTIVE', subscription };
    }

    if (subscription.status === 'TRIALING') {
      if (subscription.trialEnd && now <= new Date(subscription.trialEnd)) {
        return { allowed: true, status: 'TRIALING', subscription };
      }
      if (subscription.gracePeriodEnd && now <= new Date(subscription.gracePeriodEnd)) {
        return { allowed: true, status: 'GRACE_PERIOD', subscription };
      }
      return { allowed: false, status: 'EXPIRED', reason: 'TRIAL_EXPIRED', subscription };
    }

    if (subscription.status === 'PAST_DUE' || subscription.status === 'GRACE_PERIOD') {
      if (subscription.gracePeriodEnd && now <= new Date(subscription.gracePeriodEnd)) {
        return { allowed: true, status: subscription.status, isGracePeriod: true, subscription };
      }
      return { allowed: false, status: 'EXPIRED', reason: 'GRACE_PERIOD_EXPIRED', subscription };
    }

    if (subscription.status === 'CANCELLED') {
      if (subscription.currentPeriodEnd && now <= new Date(subscription.currentPeriodEnd)) {
        return { allowed: true, status: 'CANCELLED', willExpireAt: subscription.currentPeriodEnd, subscription };
      }
      return { allowed: false, status: 'EXPIRED', reason: 'SUBSCRIPTION_CANCELLED_AND_EXPIRED', subscription };
    }

    return { allowed: false, status: subscription.status, reason: 'SUBSCRIPTION_LOCKED', subscription };
  }

  /**
   * Change SaaS Plan for a Gym
   */
  static async changePlan(gymId, planId, billingInterval = 'MONTHLY') {
    const plan = await prisma.gymSubscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      const error = new Error('Selected subscription plan not found or inactive');
      error.statusCode = 404;
      throw error;
    }

    const price = billingInterval === 'YEARLY' && plan.yearlyPrice ? plan.yearlyPrice : plan.monthlyPrice;

    const subscription = await prisma.gymSubscription.findUnique({ where: { gymId } });
    if (!subscription) {
      const error = new Error('Gym subscription not found');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.gymSubscription.update({
      where: { gymId },
      data: {
        planId: plan.id,
        price,
        currency: plan.currency,
        billingInterval: billingInterval.toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
      },
      include: {
        plan: true
      }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        action: 'GYM_SUBSCRIPTION_PLAN_CHANGED',
        entity: 'GymSubscription',
        entityId: updated.id,
        metadata: {
          newPlanId: plan.id,
          newPlanName: plan.name,
          billingInterval,
          price: Number(price)
        }
      }
    }).catch(() => {});

    return updated;
  }

  /**
   * Renew or reactivate Gym software subscription with a recorded invoice
   */
  static async renewSubscription(gymId, { paymentDetails = {}, planId = null, billingInterval = null, months = 1 } = {}) {
    const existing = await this.getGymSubscription(gymId);
    let plan = existing?.plan;

    if (planId) {
      plan = await prisma.gymSubscriptionPlan.findUnique({ where: { id: planId } });
    }
    if (!plan) {
      plan = await prisma.gymSubscriptionPlan.findFirst({ where: { isActive: true } });
    }

    const interval = billingInterval ? billingInterval.toUpperCase() : (existing?.billingInterval || 'MONTHLY');
    const intervalMonths = interval === 'YEARLY' ? 12 : Math.max(1, Number(months) || 1);
    const amount = interval === 'YEARLY' && plan?.yearlyPrice ? Number(plan.yearlyPrice) : (Number(plan?.monthlyPrice || 49) * (interval === 'YEARLY' ? 1 : intervalMonths));

    const now = new Date();
    // If current period end is in future, add from currentPeriodEnd; else start from now
    const baseDate = (existing?.currentPeriodEnd && new Date(existing.currentPeriodEnd) > now)
      ? new Date(existing.currentPeriodEnd)
      : now;

    const newPeriodEnd = new Date(baseDate);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + intervalMonths);

    const gracePeriodDays = plan?.gracePeriodDays || 7;
    const gracePeriodEnd = new Date(newPeriodEnd.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    const invoiceCount = await prisma.gymSubscriptionInvoice.count();
    const invoiceNumber = `SAAS-INV-${now.getFullYear()}-${String(invoiceCount + 1).padStart(5, '0')}`;

    const result = await prisma.$transaction(async (tx) => {
      const updatedSub = await tx.gymSubscription.update({
        where: { gymId },
        data: {
          planId: plan ? plan.id : existing?.planId,
          status: 'ACTIVE',
          price: amount,
          currency: plan ? plan.currency : 'USD',
          billingInterval: interval,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
          gracePeriodEnd: gracePeriodEnd,
          cancelledAt: null,
          cancelAtPeriodEnd: false
        },
        include: {
          plan: true
        }
      });

      const invoice = await tx.gymSubscriptionInvoice.create({
        data: {
          gymId,
          subscriptionId: updatedSub.id,
          invoiceNumber,
          amount,
          currency: updatedSub.currency,
          status: 'PAID',
          billingPeriodStart: baseDate,
          billingPeriodEnd: newPeriodEnd,
          paidAt: now,
          stripePaymentIntentId: paymentDetails.stripePaymentIntentId || null,
          stripeInvoiceId: paymentDetails.stripeInvoiceId || null
        }
      });

      await tx.auditLog.create({
        data: {
          gymId,
          action: 'GYM_SUBSCRIPTION_RENEWED',
          entity: 'GymSubscription',
          entityId: updatedSub.id,
          metadata: {
            invoiceNumber,
            amount,
            periodEnd: newPeriodEnd.toISOString(),
            paymentMethod: paymentDetails.paymentMethod || 'CARD'
          }
        }
      });

      return { subscription: updatedSub, invoice };
    });

    return result;
  }

  /**
   * Cancel Gym software subscription (set to cancel at period end or immediate)
   */
  static async cancelSubscription(gymId, { immediate = false, reason = 'User requested cancellation' } = {}) {
    const existing = await this.getGymSubscription(gymId);
    if (!existing) {
      const error = new Error('Subscription not found');
      error.statusCode = 404;
      throw error;
    }

    const now = new Date();
    const newStatus = immediate ? 'CANCELLED' : existing.status;

    const updated = await prisma.gymSubscription.update({
      where: { gymId },
      data: {
        status: newStatus,
        cancelAtPeriodEnd: !immediate,
        cancelledAt: now
      },
      include: {
        plan: true
      }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        action: immediate ? 'GYM_SUBSCRIPTION_CANCELLED_IMMEDIATE' : 'GYM_SUBSCRIPTION_CANCEL_SCHEDULED',
        entity: 'GymSubscription',
        entityId: updated.id,
        metadata: {
          immediate,
          reason,
          effectiveExpiration: updated.currentPeriodEnd
        }
      }
    }).catch(() => {});

    return updated;
  }

  /**
   * Reactivate a subscription that was set to cancel at period end
   */
  static async reactivateSubscription(gymId) {
    const existing = await this.getGymSubscription(gymId);
    if (!existing) {
      const error = new Error('Subscription not found');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.gymSubscription.update({
      where: { gymId },
      data: {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        status: 'ACTIVE'
      },
      include: {
        plan: true
      }
    });

    await prisma.auditLog.create({
      data: {
        gymId,
        action: 'GYM_SUBSCRIPTION_REACTIVATED',
        entity: 'GymSubscription',
        entityId: updated.id,
        metadata: {
          reactivatedAt: new Date().toISOString()
        }
      }
    }).catch(() => {});

    return updated;
  }

  /**
   * Get subscription payment and invoice history for a Gym
   */
  static async getSubscriptionInvoices(gymId) {
    return await prisma.gymSubscriptionInvoice.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * List all available SaaS plans
   */
  static async getAvailablePlans() {
    return await prisma.gymSubscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' }
    });
  }
}

export default GymSubscriptionService;
