# 🏋️‍♂️ IronPulse Backend — Gym Membership & Billing OS API

IronPulse is an enterprise-grade Gym Membership, Subscription Management, and Automated Billing OS. This backend service is built with **Node.js (Express)**, **Prisma ORM**, and **MySQL / MariaDB (XAMPP compatible)**, delivering secure multi-tenant gym operations, recurring dunning workflows, automated payment processing, and multi-channel notifications.

---

## 📋 Table of Contents

- [📚 Dedicated In-Depth Documentation](#-dedicated-in-depth-documentation)
- [Features & Capabilities](#-features--capabilities)
- [Tech Stack & Architecture](#-tech-stack--architecture)
- [Project Directory Structure](#-project-directory-structure)
- [Database Models & Schema](#-database-models--schema)
- [Environment Variables](#-environment-variables)
- [Getting Started & Installation](#-getting-started--installation)

---

## 📚 Dedicated In-Depth Documentation

For specialized references and guides, see the dedicated markdown guides in [`docs/`](./docs/):

- 📡 **[API Documentation (`docs/API_DOCUMENTATION.md`)](./docs/API_DOCUMENTATION.md)**: Full REST API contracts, request/response JSON schemas, pagination & status codes.
- 🗄️ **[Database Schema Dictionary (`docs/DATABASE_SCHEMA.md`)](./docs/DATABASE_SCHEMA.md)**: Comprehensive Prisma models, fields, foreign keys, and indexes.
- 🔁 **[Dunning & Billing Lifecycle (`docs/DUNNING_AND_BILLING.md`)](./docs/DUNNING_AND_BILLING.md)**: Automated recurring cycles, retry cadences, and notification escalation rules.
- 🚀 **[Production Deployment Guide (`docs/DEPLOYMENT_GUIDE.md`)](./docs/DEPLOYMENT_GUIDE.md)**: Docker, PM2 clustering, Nginx reverse proxy, SSL, and Cloud Schedulers.
- [API Endpoints Reference](#-api-endpoints-reference)
  - [1. Authentication & Users](#1-authentication--users-apiauth)
  - [2. Dashboard & Analytics](#2-dashboard--analytics-apidashboard)
  - [3. Members Management](#3-members-management-apimembers)
  - [4. Membership Plans](#4-membership-plans-apiplans)
  - [5. Active Subscriptions](#5-active-subscriptions-apimemberships)
  - [6. Payment Methods & Tokenization](#6-payment-methods--tokenization-apipayment-methods)
  - [7. Invoices & Billing Statements](#7-invoices--billing-statements-apiinvoices)
  - [8. Payments & Transactions](#8-payments--transactions-apipayments)
  - [9. Recurring Billing Engine](#9-recurring-billing-engine-apirecurring-billing)
  - [10. Dunning & Smart Retries](#10-dunning--smart-retries-apidunning)
  - [11. Reminders & Dispatching](#11-reminders--dispatching-apireminders)
  - [12. Notification Templates](#12-notification-templates-apinotification-templates)
  - [13. Gym Settings & Billing Policy](#13-gym-settings--billing-policy-apisettings)
  - [14. Audit Logs](#14-audit-logs-apiaudit-logs)
  - [15. Webhooks](#15-webhooks-apiwebhooks)
  - [16. Automated Scheduler & Cron Jobs](#16-automated-scheduler--cron-jobs-apischeduler)
  - [17. System Health & Status](#17-system-health--status-apihealth)
- [Security & Validation Rules](#-security--validation-rules)
- [Automated Testing](#-automated-testing)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ⚡ Features & Capabilities

- 🏢 **Multi-Tenant Architecture**: Complete scoping per Gym entity (`GymId`), preventing cross-tenant data leakage.
- 🔐 **Secure Role-Based Access (RBAC)**: JWT authentication with bcrypt password hashing supporting `OWNER`, `ADMIN`, `STAFF`, and `COACH` roles.
- 💳 **Payment Processing & Gateway Integration**: Stripe direct merchant card/ACH charges, payment method tokenization, and webhook verification without storing sensitive raw card details.
- 🔄 **Autonomous Recurring Billing Engine**: Automated charge cycles for active subscriptions with next-due-date calculation and recurring schedules.
- 🔁 **Smart Dunning & Retry Cadence**: Configurable grace periods, exponential/custom retry intervals (e.g. days 1, 3, 5, 7), automated reminders, and subscription cancellation/suspension upon exhaustion.
- 📲 **Multi-Channel Notifications**: Integrated dispatchers for **Email** (Brevo / SendGrid), **SMS** (Twilio), and **WhatsApp** (Meta Cloud API) with dynamic template replacement.
- 📊 **Executive Dashboard & Reporting**: Real-time KPI aggregation (MRR, active memberships, churn rate, collection efficiency, overdue ledger).
- 📜 **Immutable Compliance Audit Logs**: Captures all critical billing, role changes, and member adjustments.
- 🛡️ **Production-Hardened Security**: Helmet security headers, rate limiting, request validation layers, and sanitized payload handlers.

---

## 🏗️ Tech Stack & Architecture

- **Runtime**: Node.js v18+ (ES Modules)
- **Framework**: Express.js
- **Database**: MySQL / MariaDB (XAMPP or Docker)
- **ORM**: Prisma ORM v6
- **Authentication**: JSON Web Tokens (JWT) + bcryptjs
- **Scheduler**: node-cron (with external cloud cron hook support)
- **Security**: Helmet, CORS, Express Rate Limit, strict input validators

---

## 📂 Project Directory Structure

```text
backend/
├── docker-compose.yml          # Containerized MySQL service configuration
├── package.json                # Dependencies, scripts, and engine metadata
├── .env                        # Local environment variables (do not commit)
├── .env.example                # Template environment variables
├── .gitignore                  # Git ignore rules for secrets and dependencies
├── README.md                   # Backend documentation (this file)
├── prisma/
│   ├── schema.prisma           # Prisma MySQL schema definitions & relations
│   └── seed.js                 # Database seeder with realistic gym starter data
├── tests/
│   └── production_readiness.test.js  # Production readiness and API integrity tests
└── src/
    ├── server.js               # Main Express entry point, middleware & routing
    ├── prisma.js               # Singleton Prisma Client instance
    ├── controllers/            # Request handlers & response formatters
    │   ├── auditLogController.js
    │   ├── authController.js
    │   ├── dashboardController.js
    │   ├── dunningController.js
    │   ├── invoiceController.js
    │   ├── memberController.js
    │   ├── membershipController.js
    │   ├── membershipPlanController.js
    │   ├── notificationTemplateController.js
    │   ├── paymentController.js
    │   ├── paymentMethodController.js
    │   ├── recurringBillingController.js
    │   ├── reminderController.js
    │   ├── reportController.js
    │   ├── settingsController.js
    │   └── webhookController.js
    ├── middleware/             # Authentication, Authorization & Route guards
    │   ├── auth.js             # JWT bearer verification & user context injection
    │   └── authorize.js        # Role-based privilege checking (OWNER, ADMIN, etc.)
    ├── routes/                 # REST API route declarations & validator binding
    │   ├── auditLogRoutes.js
    │   ├── authRoutes.js
    │   ├── dashboardRoutes.js
    │   ├── dunningRoutes.js
    │   ├── invoiceRoutes.js
    │   ├── memberRoutes.js
    │   ├── membershipPlanRoutes.js
    │   ├── membershipRoutes.js
    │   ├── notificationTemplateRoutes.js
    │   ├── paymentMethodRoutes.js
    │   ├── paymentRoutes.js
    │   ├── recurringBillingRoutes.js
    │   ├── reminderRoutes.js
    │   ├── reportRoutes.js
    │   ├── schedulerRoutes.js
    │   ├── settingsRoutes.js
    │   └── webhookRoutes.js
    ├── services/               # Business logic, calculations & gateway adapters
    │   ├── auditLogService.js
    │   ├── authService.js
    │   ├── dashboardService.js
    │   ├── dunningService.js
    │   ├── invoiceService.js
    │   ├── memberService.js
    │   ├── membershipPlanService.js
    │   ├── membershipService.js
    │   ├── notificationDispatcher.js
    │   ├── notificationTemplateService.js
    │   ├── paymentGateway/
    │   │   └── paymentGateway.js   # Stripe / card / ACH driver
    │   ├── paymentMethodService.js
    │   ├── paymentService.js
    │   ├── paymentWebhookService.js
    │   ├── recurringBillingService.js
    │   ├── reminderService.js
    │   ├── reportService.js
    │   ├── schedulerService.js
    │   ├── settingsService.js
    │   └── webhookService.js
    ├── utils/                  # Shared helpers, JWT sign/verify, config validators
    │   ├── configValidator.js
    │   ├── jwt.js
    │   └── webhookSignature.js
    └── validators/             # Request payload sanitizers & schema assertions
        ├── invoiceValidator.js
        ├── memberValidator.js
        ├── membershipPlanValidator.js
        ├── membershipValidator.js
        ├── notificationTemplateValidator.js
        ├── paymentMethodValidator.js
        ├── paymentValidator.js
        ├── recurringBillingValidator.js
        ├── reminderValidator.js
        └── webhookValidator.js
```

---

## 🗄️ Database Models & Schema

The relational schema in `prisma/schema.prisma` is designed for high data integrity, strict foreign keys, and auditability:

| Model | Purpose | Key Attributes & Relations |
| :--- | :--- | :--- |
| **Gym** | Multi-tenant club root | Holds business details, currency, tax rates, billing policies, users, members |
| **User** | Administrative staff / accounts | Scoped to Gym; roles: `OWNER`, `ADMIN`, `STAFF`, `COACH` |
| **Member** | Gym member profile | Member code (`MEM-XXXX`), contact info, status (`ACTIVE`, `INACTIVE`, `OVERDUE`, `SUSPENDED`) |
| **MembershipPlan** | Tier definition | Frequency (`MONTHLY`, `QUARTERLY`, `ANNUAL`), price, registration fee, active flag |
| **Membership** | Member subscription contract | Start date, end date, auto-renew flag, status (`ACTIVE`, `EXPIRED`, `CANCELLED`, `FROZEN`) |
| **PaymentMethod** | Tokenized payment instrument | Card / Bank instrument token (`STRIPE`), brand, last4, exp date (No raw PAN/CVV stored) |
| **Invoice** | Itemized billing record | Invoice number, subtotal, tax, discounts, status (`PAID`, `UNPAID`, `OVERDUE`, `VOID`) |
| **Payment** | Transaction ledger record | Amount, currency, status (`PAID`, `PENDING`, `FAILED`, `REFUNDED`), gateway reference |
| **RecurringBilling** | Automated recurring charge schedule | Interval, next charge date, failure count, status (`ACTIVE`, `PAUSED`, `FAILED_RETRIED`, `CANCELLED`) |
| **PaymentAttempt** | Audit trail for dunning & retries | Execution log, gateway response, failure reason, retry count |
| **Reminder** | Dispatched member notice | Type (`DUE_DATE`, `OVERDUE`, `EXPIRATION`), channel (`EMAIL`, `SMS`, `WHATSAPP`), status |
| **NotificationTemplate** | Dynamic template configuration | Template body with variable placeholders (`{{member_name}}`, `{{amount}}`, etc.) |
| **BillingPolicy** | Dunning & retry parameters | Grace period days, max retries, retry interval array, auto-suspend toggles |
| **PaymentProvider** | Gateway integration settings | Stripe/provider configuration metadata scoped to Gym |
| **IntegrationSetting** | Notification provider toggles | Configuration toggles for Email/SMS/WhatsApp dispatchers |
| **AuditLog** | Immutable activity log | Action, entity, entity ID, previous/new values, performer IP & User ID |

---

## ⚙️ Environment Variables

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

### Key Configuration Reference:

```env
# ==============================================================================
# Server Core
# ==============================================================================
PORT=5000
NODE_ENV=development
APP_URL="http://localhost:5173"
FRONTEND_URL="http://localhost:5173"

# ==============================================================================
# Database Connection (XAMPP MySQL or Remote MySQL)
# Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE
# ==============================================================================
DATABASE_URL="mysql://root:@localhost:3306/ironpulse"

# ==============================================================================
# Security & Authentication
# ==============================================================================
JWT_SECRET="replace_with_a_secure_random_64_character_hex_secret_in_production"
JWT_EXPIRES_IN="1d"
CRON_SECRET="optional_secret_for_external_cloud_cron_triggers"

# ==============================================================================
# Payment Gateway (Stripe)
# ==============================================================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ==============================================================================
# Notification Dispatchers (Optional — falls back gracefully if not supplied)
# ==============================================================================
# Email (Brevo / SendGrid)
BREVO_API_KEY=
BREVO_FROM_EMAIL="notifications@yourgym.com"
BREVO_FROM_NAME="IronPulse Athletic Club"
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL="notifications@yourgym.com"

# SMS (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# WhatsApp (Meta Cloud API)
META_WHATSAPP_PHONE_ID=
META_WHATSAPP_ACCESS_TOKEN=
```

---

## 🚀 Getting Started & Installation

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **MySQL / MariaDB**: Running via XAMPP Control Panel or standalone (port 3306)

---

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Ensure your `.env` file exists and has the correct `DATABASE_URL` pointing to your local MySQL database (e.g. `mysql://root:@localhost:3306/ironpulse`).

### Step 3: Generate Prisma Client
```bash
npm run prisma:generate
```

### Step 4: Synchronize Database Schema
Push the schema to MySQL to automatically create all tables and relations:
```bash
npx prisma db push
```

### Step 5: Seed Demo Data
Populate the database with default gym settings, plans, owner account, super admin account, and sample members:
```bash
npm run db:seed
```

> **Default Seed Credentials**:
> - **👑 Platform Super Admin**:
>   - **Email**: `superadmin@gmail.com`
>   - **Password**: `123456`
>   - **Role**: `SUPER_ADMIN`
> - **🏋️‍♂️ Gym Owner / Tenant**:
>   - **Email**: `owner@ironpulse.club`
>   - **Password**: `IronPulse2026!`
>   - **Role**: `OWNER`

### Step 6: Start Server

```bash
# Development (with node --watch)
npm run dev

# Production
npm start
```

The API server will listen on `http://localhost:5000`.

---

## 📡 API Endpoints Reference

All secured endpoints require the `Authorization: Bearer <JWT_TOKEN>` header.

### 1. Authentication & Users (`/api/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public / Admin | Register new gym owner or staff user |
| `POST` | `/api/auth/login` | Public | Authenticate user and receive JWT token |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current authenticated user profile |
| `POST` | `/api/auth/forgot-password` | Public | Request password reset instructions |
| `POST` | `/api/auth/reset-password` | Public | Reset password with token |
| `PUT` | `/api/auth/profile` | Authenticated | Update authenticated user profile |
| `PUT` | `/api/auth/change-password` | Authenticated | Change user account password |
| `GET` | `/api/auth/users` | `OWNER`, `ADMIN` | List staff/admin users in current gym |
| `POST` | `/api/auth/users` | `OWNER`, `ADMIN` | Create new staff user |
| `PUT` | `/api/auth/users/:id` | `OWNER`, `ADMIN` | Update staff user details/role |
| `DELETE` | `/api/auth/users/:id` | `OWNER` | Delete staff user |

---

### 2. Dashboard & Analytics (`/api/dashboard`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/stats` | Authenticated | High-level metrics: MRR, active members, overdue count, collection rate |
| `GET` | `/api/dashboard/recent-activity` | Authenticated | Recent payments, member signups, dunning alerts |
| `GET` | `/api/dashboard/revenue-chart` | Authenticated | Monthly revenue trend and collection efficiency |

---

### 3. Members Management (`/api/members`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/members` | Authenticated | List members (supports search, pagination, status filters) |
| `GET` | `/api/members/:id` | Authenticated | Get comprehensive member profile with active plan, cards, invoices |
| `POST` | `/api/members` | Authenticated | Create new member profile |
| `PUT` | `/api/members/:id` | Authenticated | Update member information |
| `DELETE` | `/api/members/:id` | `OWNER`, `ADMIN` | Soft-delete / deactivate member |
| `POST` | `/api/members/:id/freeze` | Authenticated | Freeze member subscription |
| `POST` | `/api/members/:id/unfreeze` | Authenticated | Unfreeze and reactivate membership |

---

### 4. Membership Plans (`/api/plans`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/plans` | Authenticated | List all active/inactive membership tiers |
| `GET` | `/api/plans/:id` | Authenticated | Get details of a specific membership plan |
| `POST` | `/api/plans` | `OWNER`, `ADMIN` | Create new tier (`Basic`, `Standard`, `VIP Athlete`, etc.) |
| `PUT` | `/api/plans/:id` | `OWNER`, `ADMIN` | Update tier pricing, billing frequency, description |
| `DELETE` | `/api/plans/:id` | `OWNER`, `ADMIN` | Deactivate/delete plan tier |

---

### 5. Active Subscriptions (`/api/memberships`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/memberships` | Authenticated | List all member subscription contracts |
| `GET` | `/api/memberships/:id` | Authenticated | Get contract details, renewal schedule, and invoice links |
| `POST` | `/api/memberships` | Authenticated | Assign plan to member and start subscription |
| `PUT` | `/api/memberships/:id` | Authenticated | Update subscription dates or auto-renew terms |
| `POST` | `/api/memberships/:id/cancel` | Authenticated | Cancel active membership subscription |

---

### 6. Payment Methods & Tokenization (`/api/payment-methods`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/payment-methods/member/:memberId` | Authenticated | List tokenized payment methods on file for a member |
| `POST` | `/api/payment-methods` | Authenticated | Save tokenized card or ACH instrument (Stripe token) |
| `POST` | `/api/payment-methods/:id/set-default` | Authenticated | Set primary billing payment method |
| `DELETE` | `/api/payment-methods/:id` | Authenticated | Remove payment method from file |

---

### 7. Invoices & Billing Statements (`/api/invoices`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/invoices` | Authenticated | List invoices with status filtering (`PAID`, `UNPAID`, `OVERDUE`) |
| `GET` | `/api/invoices/:id` | Authenticated | Get itemized invoice breakdown |
| `POST` | `/api/invoices` | Authenticated | Generate manual or one-off billing invoice |
| `PUT` | `/api/invoices/:id/void` | `OWNER`, `ADMIN` | Void an unpaid invoice |
| `GET` | `/api/invoices/:id/pdf` | Authenticated | Get formatted invoice print data |

---

### 8. Payments & Transactions (`/api/payments`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/payments` | Authenticated | List payment ledger transactions |
| `GET` | `/api/payments/:id` | Authenticated | Get specific payment receipt and attempt logs |
| `POST` | `/api/payments/record` | `OWNER`, `ADMIN` | **Record Member Payment (Cash / QR)** with manual admin verification (No Stripe fee) |
| `POST` | `/api/payments/charge` | Authenticated | Execute charge via Stripe or record manual cash/POS payment |
| `POST` | `/api/payments/:id/refund` | `OWNER`, `ADMIN` | Process full or partial refund (reverses Stripe charge if applicable) |

---

### 9. Recurring Billing Engine (`/api/recurring-billing`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/recurring-billing` | Authenticated | List recurring schedules and upcoming draft dates |
| `GET` | `/api/recurring-billing/:id` | Authenticated | Get recurring schedule breakdown and history |
| `POST` | `/api/recurring-billing/process-due` | `OWNER`, `ADMIN` | Manually trigger processing of all due recurring charges |
| `POST` | `/api/recurring-billing/:id/pause` | Authenticated | Pause recurring billing schedule |
| `POST` | `/api/recurring-billing/:id/resume` | Authenticated | Resume paused recurring billing schedule |

---

### 10. Dunning & Smart Retries (`/api/dunning`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dunning/queue` | Authenticated | View failed charges currently in retry pipeline |
| `GET` | `/api/dunning/history` | Authenticated | View past dunning executions and recovery success stats |
| `POST` | `/api/dunning/process-retries` | `OWNER`, `ADMIN` | Trigger dunning retry cycle for eligible overdue records |
| `POST` | `/api/dunning/retry/:paymentId` | Authenticated | Manually re-attempt a specific failed transaction |

---

### 11. Reminders & Dispatching (`/api/reminders`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reminders` | Authenticated | List dispatched and queued reminders |
| `POST` | `/api/reminders/send` | Authenticated | Dispatch instant reminder (Email / SMS / WhatsApp) |
| `POST` | `/api/reminders/process-due` | `OWNER`, `ADMIN` | Trigger automated upcoming due date reminders |

---

### 12. Notification Templates (`/api/notification-templates`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notification-templates` | Authenticated | List all templates (`PAYMENT_DUE`, `PAYMENT_FAILED`, `OVERDUE_ALERT`) |
| `GET` | `/api/notification-templates/:id` | Authenticated | Get template body & placeholders |
| `POST` | `/api/notification-templates` | `OWNER`, `ADMIN` | Create custom notification template |
| `PUT` | `/api/notification-templates/:id` | `OWNER`, `ADMIN` | Update template content & subject |
| `DELETE` | `/api/notification-templates/:id` | `OWNER`, `ADMIN` | Delete custom template |

---

### 13. Gym Settings & Payment QR Configuration (`/api/settings`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/settings` | Authenticated | Get gym business profile, currency, tax rates, billing policy |
| `GET` | `/api/settings/payment-qr` | `OWNER`, `ADMIN` | **Get Gym's Configured Payment QR Code & UPI Details** |
| `POST` | `/api/settings/payment-qr` | `OWNER`, `ADMIN` | **Upload / Update Gym's Payment QR Code (Tenant Isolated)** |
| `DELETE` | `/api/settings/payment-qr` | `OWNER`, `ADMIN` | **Delete Gym's Payment QR Code** |
| `PUT` | `/api/settings/gym` | `OWNER`, `ADMIN` | Update gym profile (name, address, phone, logo) |
| `PUT` | `/api/settings/billing-policy` | `OWNER`, `ADMIN` | Update dunning grace period, retry cadences, tax rate |
| `PUT` | `/api/settings/integrations` | `OWNER` | Configure third-party providers (Stripe, Twilio, Brevo) |

---

### 14. Audit Logs (`/api/audit-logs`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/audit-logs` | `OWNER`, `ADMIN` | Query immutable audit trails with date, action, and user filters |

---

### 15. Webhooks (`/api/webhooks`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/stripe` | Public (Stripe Signature verified) | Receive Stripe asynchronous payment events (`charge.succeeded`, `charge.failed`) |

---

### 16. Automated Scheduler & Cron Jobs (`/api/scheduler`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/scheduler/status` | Authenticated | View scheduler execution state and next job run times |
| `POST` | `/api/scheduler/run-daily-cycle` | Secret/Admin | Run full daily billing, retry, and notification cycle |

---

### 17. System Health & Status (`/api/health`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Returns database connection status and API health timestamp |

---

## 🔒 Security & Validation Rules

1. **Multi-Tenancy Isolation**: Every service query filters by `gymId` extracted from the authenticated user's session token.
2. **Safe Payment Storage**: Raw credit card PANs and CVVs are **never stored** in the database. Only gateway customer IDs and payment method tokens (`pm_xxx`) are preserved.
3. **Payload Sanitization**: All endpoints pass through dedicated input validator middleware (`src/validators/*`) before reaching controllers.
4. **Graceful Fallbacks**: When third-party gateway keys (Stripe, Twilio, Brevo) are unconfigured, operations record informative status messages (`CONFIGURATION_REQUIRED`) without crashing or producing false positives.

---

## 🧪 Automated Testing

Run the automated production-readiness suite:

```bash
npm test
```

This verifies:
- Database connectivity & Prisma query execution
- Multi-tenancy scoping
- Dunning retry cadence calculations
- JWT verification & role authorization
- Webhook signature parsing
- Graceful error responses

---

## ❓ Troubleshooting & FAQ

### Database Connection Error (`P1001: Can't reach database server`)
- Make sure **MySQL** is started in the **XAMPP Control Panel**.
- Verify that port `3306` is open and not blocked by another service.
- Check your `DATABASE_URL` in `.env`: `mysql://root:@localhost:3306/ironpulse`.

### Prisma Schema Mismatch
If schema changes occur, synchronize your local database:
```bash
npm run prisma:generate
npx prisma db push
```

### Reset & Reseed Database
To start fresh with clean sample records:
```bash
npx prisma db push --force-reset
npm run db:seed
```

---

## 📄 License & Ownership

IronPulse is proprietary software designed for gym and fitness enterprise management. All rights reserved.
