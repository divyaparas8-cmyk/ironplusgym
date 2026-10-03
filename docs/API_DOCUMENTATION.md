# 📡 IronPulse API Documentation & Contract Reference

This document provides a detailed specification for the IronPulse Backend REST API, including authentication headers, request payloads, response schemas, and status codes.

---

## 🔐 Global Authentication

All protected endpoints require a JWT Bearer Token in the `Authorization` header:

```http
Authorization: Bearer <YOUR_JWT_TOKEN>
```

When a request is unauthenticated or invalid:
- `401 Unauthorized` → Missing, expired, or invalid token.
- `403 Forbidden` → Insufficient role permissions or cross-tenant access attempt.

---

## 1. Authentication & User Management (`/api/auth`)

### 1.1 User Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "owner@ironpulse.club",
  "password": "IronPulse@2025"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "usr_c83j91...",
    "gymId": "gym_a1b2c3...",
    "name": "Alex Mercer",
    "email": "owner@ironpulse.club",
    "role": "OWNER"
  }
}
```

### 1.2 Get Current Profile
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Access**: Authenticated

### 1.3 Change Password
- **Method**: `PUT`
- **Path**: `/api/auth/change-password`
- **Access**: Authenticated
- **Request Body**:
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewSecurePassword2026!"
}
```

---

## 2. Member Operations (`/api/members`)

### 2.1 List Members (with Search & Filters)
- **Method**: `GET`
- **Path**: `/api/members?page=1&limit=20&search=Marcus&status=ACTIVE`
- **Access**: Authenticated
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    {
      "id": "mem_9182...",
      "memberCode": "MEM-8021",
      "firstName": "Marcus",
      "lastName": "Vance",
      "email": "marcus.vance@example.com",
      "phone": "+1 (555) 234-5678",
      "status": "ACTIVE",
      "joinDate": "2025-01-15T00:00:00.000Z",
      "memberships": [
        {
          "id": "mshp_123...",
          "status": "ACTIVE",
          "plan": {
            "name": "VIP Athlete",
            "price": 149.00
          }
        }
      ]
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

### 2.2 Create New Member
- **Method**: `POST`
- **Path**: `/api/members`
- **Request Body**:
```json
{
  "firstName": "Sophia",
  "lastName": "Chen",
  "email": "sophia.chen@example.com",
  "phone": "+1 555-432-1098",
  "gender": "FEMALE",
  "dob": "1994-06-20",
  "address": "742 Evergreen Terrace",
  "emergencyContactName": "David Chen",
  "emergencyContactPhone": "+1 555-432-1099"
}
```

### 2.3 Freeze / Unfreeze Member Subscription
- **Freeze**: `POST /api/members/:id/freeze`
  - Body: `{ "freezeReason": "Medical injury", "resumeDate": "2026-11-01" }`
- **Unfreeze**: `POST /api/members/:id/unfreeze`

---

## 3. Recurring Billing & Subscriptions (`/api/recurring-billing`)

### 3.1 Process Due Recurring Cycles
- **Method**: `POST`
- **Path**: `/api/recurring-billing/process-due`
- **Access**: Admin / Cloud Cron
- **Description**: Evaluates all active recurring schedules whose `nextChargeDate <= today`, initiates payment attempts via default payment method, creates invoice statements, and triggers dunning on failure.
- **Response `200 OK`**:
```json
{
  "success": true,
  "summary": {
    "processed": 14,
    "succeeded": 12,
    "failed": 2,
    "timestamp": "2026-09-29T22:00:00.000Z"
  }
}
```

---

## 4. Dunning & Smart Retries (`/api/dunning`)

### 4.1 Get Dunning Retry Pipeline
- **Method**: `GET`
- **Path**: `/api/dunning/queue`
- **Response `200 OK`**:
```json
{
  "success": true,
  "queue": [
    {
      "paymentId": "pay_8829...",
      "member": { "name": "Elena Rostova", "email": "elena@example.com" },
      "amount": 89.00,
      "failedAttempts": 2,
      "nextRetryDate": "2026-10-02T08:00:00.000Z",
      "lastFailureReason": "insufficient_funds"
    }
  ]
}
```

### 4.2 Manual Instant Retry
- **Method**: `POST`
- **Path**: `/api/dunning/retry/:paymentId`
- **Description**: Bypasses the schedule timer to re-attempt an overdue payment immediately.

---

## 5. Invoices & Billing Statements (`/api/invoices`)

### 5.1 Generate Invoice
- **Method**: `POST`
- **Path**: `/api/invoices`
- **Request Body**:
```json
{
  "memberId": "mem_9182...",
  "items": [
    { "description": "Monthly Membership - VIP Tier", "amount": 149.00, "quantity": 1 },
    { "description": "Locker Rental", "amount": 25.00, "quantity": 1 }
  ],
  "taxRate": 8.5,
  "discountAmount": 10.00,
  "dueDate": "2026-10-15"
}
```

---

## 6. Reminders & Multi-Channel Dispatching (`/api/reminders`)

### 6.1 Send Instant Custom Notice
- **Method**: `POST`
- **Path**: `/api/reminders/send`
- **Request Body**:
```json
{
  "memberId": "mem_9182...",
  "channel": "SMS",
  "type": "PAYMENT_DUE",
  "message": "Hi Marcus, your IronPulse subscription payment of $149 is due tomorrow. Pay online at ironpulse.club/portal."
}
```

---

## 7. Webhooks (`/api/webhooks`)

### 7.1 Stripe Asynchronous Webhook
- **Method**: `POST`
- **Path**: `/api/webhooks/stripe`
- **Headers**: `stripe-signature: t=...,v1=...`
- **Handled Events**:
  - `charge.succeeded` → Marks invoice & payment as `PAID`.
  - `charge.failed` → Increments dunning attempt counter, triggers dunning email/SMS notice.
  - `payment_method.attached` → Adds tokenized card to member profile.
