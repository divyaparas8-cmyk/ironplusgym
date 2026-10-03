# 🔁 IronPulse Dunning Engine & Automated Billing Lifecycle

This document explains the autonomous recurring billing and dunning (payment recovery) mechanics in IronPulse.

---

## 🔄 1. Recurring Billing Lifecycle Flowchart

```text
[ Daily Cron Job @ 00:00 UTC ]
               │
               ▼
[ Find Active Subscriptions with nextChargeDate <= Today ]
               │
               ▼
[ Check Default Tokenized Payment Method ]
       │                                │
       ▼ (Found)                        ▼ (Missing)
[ Execute Charge via Gateway ]    [ Mark UNPAID & Enter Dunning ]
       │                                │
       ├────────────────────────────────┤
       │                                │
  (Success)                         (Failed)
       │                                │
       ▼                                ▼
- Mark Invoice PAID              - Increment retryCount
- Advance nextChargeDate         - Compute nextRetryDate via policy
- Send Receipt Notification      - Dispatch Payment Failure Notice
                                 - Member status → OVERDUE
```

---

## 🔁 2. Smart Dunning & Retry Cadence

IronPulse prevents revenue churn through smart retry scheduling configured in `BillingPolicy`:

| Attempt # | Execution Time | Action Taken |
| :--- | :--- | :--- |
| **Initial** | Due Date | Attempt default card. If failed, schedule Attempt 1 in +1 day. |
| **Retry 1** | Due Date + 1 Day | Attempt charge. Send Email notice with 1-click update link. |
| **Retry 2** | Due Date + 3 Days | Attempt charge. Dispatch SMS / WhatsApp alert. |
| **Retry 3** | Due Date + 5 Days | Attempt charge. Urgent final warning sent. |
| **Retry 4** | Due Date + 7 Days | Final retry attempt. |
| **Exhaustion**| Post Max Retries | If still failed, cancel auto-renew, mark member `SUSPENDED` (if enabled in policy), and alert gym staff. |

---

## 📲 3. Multi-Channel Notification Hierarchy

When payments fail or are upcoming, the notification dispatcher selects channels based on urgency:

1. **3 Days Before Due Date**: Email notification (Friendly invoice statement).
2. **On Due Date Failure**: Immediate Email + In-App notification.
3. **During Active Dunning**: Multi-channel escalation (SMS & WhatsApp alerts).
4. **Subscription Frozen/Suspended**: SMS & Email alert with reactivate link.

---

## 🛡️ 4. Idempotency & Concurrency Safety

- **Double-Charge Prevention**: Before triggering any charge, the backend locks the billing row or verifies whether an unsettled transaction already exists for that invoice period.
- **Webhook Reconciliation**: If an offline payment settles asynchronously (e.g. 3D Secure verification or ACH clearance), Stripe webhooks update the status to `PAID` without triggering duplicate ledger entries.
