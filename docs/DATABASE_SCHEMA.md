# 🗄️ IronPulse Database Data Dictionary & Schema Specification

This document details the database architecture of IronPulse Gym OS managed through **Prisma ORM** over **MySQL / MariaDB**.

---

## 🏛️ Entity Relationship Diagram (Conceptual)

```text
[Gym] 1 ────────── * [User] (Role-Based Access)
  │
  ├─────────────── * [MembershipPlan] (VIP Athlete, Standard, etc.)
  │                     │
  │                     ▼
  ├─────────────── * [Member] 1 ──── * [Membership]
  │                     │                 │
  │                     ├────────── * [PaymentMethod] (Tokenized)
  │                     │                 │
  │                     ├────────── * [Invoice] 1 ──── 1 [Payment]
  │                     │                 │               │
  │                     │                 ▼               ▼
  │                     │          [InvoiceItem]   [PaymentAttempt]
  │                     │
  │                     └────────── * [Reminder] (Email / SMS / WA)
  │
  ├─────────────── 1 [BillingPolicy] (Dunning rules & Tax rates)
  ├─────────────── * [NotificationTemplate]
  └─────────────── * [AuditLog] (Immutable compliance trail)
```

---

## 📋 Data Models & Column Specifications

### 1. `Gym` (Multi-Tenant Root)
- `id` (VARCHAR, PK) - Unique Gym Identifier (`cuid` / `uuid`).
- `name` (VARCHAR) - Legal business name.
- `currency` (VARCHAR, Default `'USD'`) - Default operational currency.
- `taxRate` (DECIMAL, Default `0.00`) - Default sales/service tax percentage.
- `createdAt` / `updatedAt` (TIMESTAMP).

---

### 2. `User` (Administrative Accounts)
- `id` (VARCHAR, PK)
- `gymId` (VARCHAR, FK → `Gym.id`, ON DELETE CASCADE)
- `name` (VARCHAR) - Full name.
- `email` (VARCHAR, Unique) - Login email.
- `password` (VARCHAR) - bcrypt hash.
- `role` (ENUM: `'OWNER'`, `'ADMIN'`, `'STAFF'`, `'COACH'`).
- `isActive` (BOOLEAN, Default `true`).

---

### 3. `Member` (Client / Athlete Profiles)
- `id` (VARCHAR, PK)
- `gymId` (VARCHAR, FK → `Gym.id`, ON DELETE CASCADE)
- `memberCode` (VARCHAR, Unique) - e.g. `MEM-8021`.
- `firstName`, `lastName` (VARCHAR)
- `email` (VARCHAR), `phone` (VARCHAR)
- `status` (ENUM: `'ACTIVE'`, `'INACTIVE'`, `'OVERDUE'`, `'SUSPENDED'`, `'FROZEN'`)
- `gender`, `dob`, `address`
- `emergencyContactName`, `emergencyContactPhone`

---

### 4. `MembershipPlan` (Tier Definitions)
- `id` (VARCHAR, PK)
- `gymId` (VARCHAR, FK → `Gym.id`, ON DELETE CASCADE)
- `name` (VARCHAR) - e.g. `VIP Performance`.
- `price` (DECIMAL) - Base billing amount.
- `billingFrequency` (ENUM: `'MONTHLY'`, `'QUARTERLY'`, `'SEMI_ANNUAL'`, `'ANNUAL'`)
- `registrationFee` (DECIMAL, Default `0.00`)
- `features` (JSON / TEXT array of included perks).
- `isActive` (BOOLEAN, Default `true`).

---

### 5. `Membership` (Subscription Contracts)
- `id` (VARCHAR, PK)
- `memberId` (VARCHAR, FK → `Member.id`, ON DELETE CASCADE)
- `planId` (VARCHAR, FK → `MembershipPlan.id`)
- `gymId` (VARCHAR, FK → `Gym.id`)
- `startDate` (DATETIME)
- `endDate` (DATETIME)
- `autoRenew` (BOOLEAN, Default `true`)
- `status` (ENUM: `'ACTIVE'`, `'EXPIRED'`, `'CANCELLED'`, `'FROZEN'`)

---

### 6. `PaymentMethod` (Tokenized Instruments)
- `id` (VARCHAR, PK)
- `memberId` (VARCHAR, FK → `Member.id`)
- `gymId` (VARCHAR, FK → `Gym.id`)
- `provider` (ENUM: `'STRIPE'`, `'MANUAL'`)
- `providerPaymentMethodId` (VARCHAR) - e.g. `pm_1O9s...`
- `type` (ENUM: `'CARD'`, `'ACH'`)
- `brand` (VARCHAR) - e.g. `Visa`, `Mastercard`.
- `last4` (VARCHAR) - e.g. `4242`.
- `expMonth`, `expYear` (INT)
- `isDefault` (BOOLEAN, Default `false`)

---

### 7. `Invoice` & `InvoiceItem`
- `id` (VARCHAR, PK)
- `invoiceNumber` (VARCHAR, Unique) - e.g. `INV-2026-0041`.
- `memberId` (VARCHAR, FK → `Member.id`)
- `gymId` (VARCHAR, FK → `Gym.id`)
- `subtotal`, `taxAmount`, `discountAmount`, `total` (DECIMAL)
- `status` (ENUM: `'PAID'`, `'UNPAID'`, `'OVERDUE'`, `'VOID'`)
- `dueDate`, `paidAt` (DATETIME)

---

### 8. `Payment` & `PaymentAttempt`
- `id` (VARCHAR, PK)
- `invoiceId` (VARCHAR, FK → `Invoice.id`, Nullable)
- `memberId` (VARCHAR, FK → `Member.id`)
- `amount` (DECIMAL)
- `currency` (VARCHAR)
- `status` (ENUM: `'PAID'`, `'PENDING'`, `'FAILED'`, `'REFUNDED'`)
- `providerTransactionId` (VARCHAR)
- `PaymentAttempt`: Records retry iteration, raw gateway error code, timestamp, and failure message.

---

### 9. `RecurringBilling` (Automation Engine)
- `id` (VARCHAR, PK)
- `membershipId` (VARCHAR, FK → `Membership.id`, Unique)
- `nextChargeDate` (DATETIME)
- `billingInterval` (ENUM: `'MONTHLY'`, `'QUARTERLY'`, `'ANNUAL'`)
- `retryCount` (INT, Default `0`)
- `status` (ENUM: `'ACTIVE'`, `'PAUSED'`, `'FAILED_RETRIED'`, `'CANCELLED'`)

---

### 10. `BillingPolicy` (Dunning Rules per Gym)
- `id` (VARCHAR, PK)
- `gymId` (VARCHAR, FK → `Gym.id`, Unique)
- `gracePeriodDays` (INT, Default `5`)
- `maxRetries` (INT, Default `4`)
- `retryScheduleDays` (JSON array: `[1, 3, 5, 7]`)
- `autoSuspendAfterRetries` (BOOLEAN, Default `true`)
- `taxRate` (DECIMAL)

---

### 11. `AuditLog` (Immutable Compliance)
- `id` (VARCHAR, PK)
- `gymId` (VARCHAR, FK → `Gym.id`)
- `userId` (VARCHAR, FK → `User.id`, Nullable)
- `action` (VARCHAR) - e.g. `MEMBER_STATUS_CHANGED`, `PAYMENT_REFUNDED`.
- `entity` (VARCHAR) - e.g. `Member`, `Payment`.
- `entityId` (VARCHAR)
- `details` (JSON)
- `ipAddress` (VARCHAR)
- `createdAt` (TIMESTAMP)
