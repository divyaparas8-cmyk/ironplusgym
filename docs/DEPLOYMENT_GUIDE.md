# 🚀 IronPulse Backend Production Deployment & DevOps Guide

This guide details steps for deploying the IronPulse backend in production environments using **PM2**, **Docker**, or **Cloud PaaS (Render, Railway, AWS EC2, DigitalOcean)**.

---

## 🛠️ Production Checklist

- [ ] Set `NODE_ENV=production` in environment.
- [ ] Generate a secure, 64-character hex `JWT_SECRET` (`openssl rand -hex 32`).
- [ ] Configure production MySQL connection string with connection pooling.
- [ ] Enable SSL / TLS certificates (via Nginx reverse proxy or Cloudflare).
- [ ] Configure live Stripe API keys and Webhook signing secret.
- [ ] Set up external health monitoring (`/api/health`).
- [ ] Set up daily Cloud Scheduler trigger on `/api/scheduler/run-daily-cycle` with `x-cron-secret`.

---

## 🐳 Option 1: Docker Deployment

### 1. Build and Run via Docker Compose
```bash
docker-compose up -d --build
```

### 2. Apply Migrations inside Container
```bash
docker-compose exec app npx prisma migrate deploy
```

---

## ⚡ Option 2: Linux VPS / PM2 Process Manager

### 1. Install PM2
```bash
npm install -g pm2
```

### 2. Start Application with PM2 Cluster Mode
```bash
pm2 start src/server.js --name "ironpulse-api" -i max --env production
pm2 save
pm2 startup
```

### 3. Setup Nginx Reverse Proxy
```nginx
server {
    server_name api.yourgymdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ⏰ Cloud Cron & External Scheduler Setup

If running in a serverless or ephemeral container environment where background node-cron timers cannot run continuously:

Set up an HTTP POST trigger via **Google Cloud Scheduler**, **AWS EventBridge**, or **CronJob.org**:
- **Target URL**: `https://api.yourgymdomain.com/api/scheduler/run-daily-cycle`
- **Schedule**: `0 0 * * *` (Every midnight)
- **Header**: `x-cron-secret: <CRON_SECRET_VALUE>`
