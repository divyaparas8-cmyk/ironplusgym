# 🏋️‍♂️ IronPulse Backend — Prisma Database & API Layer

This directory contains the database layer and backend service for **IronPulse // Gym Membership & Billing OS**, powered by **XAMPP MySQL / MariaDB** and **Prisma ORM**.

---

## 🏗️ Architecture & Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Database**: MySQL / MariaDB (via XAMPP)
- **ORM**: Prisma ORM v6
- **Server**: Express.js
- **Configuration**: dotenv

---

## 📂 Directory Structure

```text
backend/
├── docker-compose.yml         # Container reference
├── package.json               # Dependencies & scripts
├── .env                       # Local environment variables (git-ignored)
├── .env.example               # Template environment variables
├── .gitignore                 # Excludes node_modules & secrets
├── prisma/
│   ├── schema.prisma          # Relational multi-tenant database schema (MySQL)
│   └── seed.js                # Database seeder matching frontend mock data
└── src/
    ├── prisma.js              # Prisma Client singleton
    └── server.js              # Express API server with database health check
```

---

## 🗄️ Database Schema & Models

The Prisma schema is specifically modeled around the IronPulse domain rules:

| Model | Description | Key Relationships |
| :--- | :--- | :--- |
| **Gym** | Multi-tenant club profile & facilities | Owns all users, members, plans, payments & policies |
| **User** | Administrative users (`OWNER`, `ADMIN`) | Scoped to `Gym`, creates audit logs |
| **Member** | Gym member profiles with contact & status | Scoped to `Gym`, has memberships, payments, reminders |
| **MembershipPlan** | Tier configuration (`VIP Athlete`, etc.) | Scoped to `Gym`, assigned to memberships |
| **Membership** | Active member plan subscription contract | Belongs to `Member`, `Gym`, `MembershipPlan` |
| **PaymentMethod** | Tokenized safe payment instrument (`CARD`, `ACH`) | Belongs to `Member` & `Gym` (No raw card data stored) |
| **Invoice** | Itemized billing statement | Linked to `Member`, `Gym`, and `Payment` |
| **Payment** | Ledger transaction record (`PAID`, `FAILED`, etc.) | Linked to `Member`, `Invoice`, and `PaymentAttempt` |
| **RecurringBilling** | Automated recurring charge schedule | Linked to `Membership` for automated drafting |
| **PaymentAttempt** | Audit trail for smart retries & dunning steps | Belongs to `Payment` |
| **Reminder** | Multi-channel notice log (`EMAIL`, `SMS`, `WHATSAPP`)| Scoped to `Gym` and `Member` |
| **NotificationTemplate** | Reusable message template per notification type | Scoped to `Gym` |
| **PaymentProvider** | Gateway configuration reference (`STRIPE`, etc.) | Scoped to `Gym` (Safe config only, no raw secret keys) |
| **BillingPolicy** | Dunning rules (grace period, retry cadences) | 1-to-1 with `Gym` |
| **IntegrationSetting**| SMS/Email provider configuration toggles | Scoped to `Gym` |
| **AuditLog** | Immutable activity log for compliance | Linked to `Gym` and `User` |

---

## ⚙️ Environment Variables

Create `.env` from `.env.example`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="mysql://root:@localhost:3306/ironpulse"
```

---

## 🚀 Getting Started

### 1. Start XAMPP MySQL
Ensure MySQL is started via the **XAMPP Control Panel** on port `3306`.
The database name used is `ironpulse`.

### 2. Generate Prisma Client
```bash
npm run prisma:generate
```

### 3. Push Schema to MySQL Database
```bash
npx prisma db push
```

### 4. Seed Database with Realistic Demo Data
```bash
npm run db:seed
```
This populates:
- **Default Gym**: IronPulse Athletic Club & Performance Lab
- **Owner Account**: `owner@ironpulse.club`
- **4 Membership Plans**: Basic Iron, Standard Fitness, Elite Performance, VIP Athlete
- **Billing Policy**: 5-day grace period, [1, 3, 5, 7] retry schedule, 8.5% tax
- **Sample Member**: Marcus Vance (`MEM-8021`) with card token, invoice & payment

### 5. Start API Server
```bash
# Development mode with watch
npm run dev

# Production start
npm start
```

Health check endpoint available at:
`http://localhost:5000/api/health`
