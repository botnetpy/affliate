# MagmaProp Affiliate System

Affiliate tracking and commission management system for MagmaProp. Tracks referral links, monitors signups and payments via webhooks, calculates tiered commissions, and provides dashboards for both admins and affiliates.

## Features

- **Affiliate Registration & Management** — affiliates register, admin approves
- **Referral Link Tracking** — unique codes, click tracking
- **Webhook Integration** — receives signup and payment events from magmaprop.com
- **Tiered Commission** — 10% (first 50 referrals), 20% (50+), one-time per user
- **Admin Dashboard** — stats, affiliate management, referrals, payouts, webhook logs
- **Affiliate Dashboard** — stats, earnings, referral list, payout requests, profile
- **Security** — HMAC webhook verification, JWT auth, rate limiting, Helmet.js

## Tech Stack

- Node.js + Express
- PostgreSQL
- Chart.js (dashboard charts)
- JWT (httpOnly cookies)

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 2. Clone & Install

```bash
cd magmaprop-affiliate
npm install
```

### 3. Database Setup

```bash
# Create the database and tables
psql -U postgres -f src/db/schema.sql
```

### 4. Environment

```bash
cp .env.example .env
# Edit .env with your values:
```

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/magmaprop_affiliate
JWT_SECRET=generate-a-strong-random-secret-here
WEBHOOK_SECRET=shared-secret-between-magmaprop-and-this-system
CORS_ORIGIN=https://magmaprop.com
SITE_URL=https://magmaprop.com
```

### 5. Seed Admin User

```bash
node src/db/seed-admin.js
# Default: admin@magmaprop.com / admin123
# ⚠️ Change this immediately after first login!
```

### 6. Start

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

- Admin dashboard: `http://localhost:3000/admin/`
- Affiliate dashboard: `http://localhost:3000/affiliate/`

---

## Webhook Integration Guide

Your magmaprop.com site needs to call two webhook endpoints on this system. Both require HMAC-SHA256 signature verification.

### Generating the Signature

Use the shared `WEBHOOK_SECRET` to sign the JSON payload:

```javascript
const crypto = require('crypto');

function signWebhook(payload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
}

// Example usage
const payload = { ref_code: 'AbCd1234', user_id: 'usr_123', email: 'user@example.com' };
const signature = signWebhook(payload, process.env.WEBHOOK_SECRET);

await fetch('https://affiliate.magmaprop.com/api/webhooks/signup', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature
    },
    body: JSON.stringify(payload)
});
```

### Python Example

```python
import hmac, hashlib, json, requests

def sign_webhook(payload, secret):
    return hmac.new(
        secret.encode(), json.dumps(payload).encode(), hashlib.sha256
    ).hexdigest()

payload = {"ref_code": "AbCd1234", "user_id": "usr_123", "email": "user@example.com"}
signature = sign_webhook(payload, WEBHOOK_SECRET)

requests.post(
    "https://affiliate.magmaprop.com/api/webhooks/signup",
    json=payload,
    headers={"X-Webhook-Signature": signature}
)
```

### Webhook 1: Signup

**When to call:** After a user creates an account on magmaprop.com via an affiliate link.

```
POST /api/webhooks/signup
Header: X-Webhook-Signature: <hmac-sha256-hex>
```

```json
{
    "ref_code": "AbCd1234",
    "user_id": "usr_123",
    "email": "user@example.com",
    "timestamp": "2026-02-06T07:00:00Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `ref_code` | ✅ | Affiliate's referral code (from `?ref=` URL param) |
| `user_id` | ✅ | Your internal user ID for the new account |
| `email` | ❌ | User's email (for display in dashboards) |
| `timestamp` | ❌ | ISO 8601 timestamp (defaults to now) |

### Webhook 2: Payment

**When to call:** After a referred user completes a payment (crypto confirmed).

```
POST /api/webhooks/payment
Header: X-Webhook-Signature: <hmac-sha256-hex>
```

```json
{
    "user_id": "usr_123",
    "amount": 150.00,
    "currency": "USDT",
    "transaction_id": "tx_abc123def456",
    "timestamp": "2026-02-06T08:30:00Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `user_id` | ✅ | Same user ID from signup webhook |
| `amount` | ✅ | Payment amount (used for commission calculation) |
| `transaction_id` | ✅ | Unique payment/transaction identifier |
| `currency` | ❌ | Currency code (default: "USDT") |
| `timestamp` | ❌ | ISO 8601 timestamp (defaults to now) |

### How to Read the `ref` Parameter

On magmaprop.com, when a user visits via an affiliate link like `magmaprop.com?ref=AbCd1234`:

```javascript
// On magmaprop.com - capture the ref code
const urlParams = new URLSearchParams(window.location.search);
const refCode = urlParams.get('ref');

if (refCode) {
    // Store in cookie/localStorage so it persists through signup
    document.cookie = `ref=${refCode}; max-age=${30 * 24 * 60 * 60}; path=/`;
    
    // Optional: track the click
    fetch(`https://affiliate.magmaprop.com/api/track/click?ref=${refCode}`);
}

// During signup, read it back
const storedRef = document.cookie.split(';')
    .find(c => c.trim().startsWith('ref='))
    ?.split('=')[1];
```

### Click Tracking (Optional)

Track affiliate link clicks for analytics:

```
GET /api/track/click?ref=AbCd1234
```

No authentication required. Returns `{ "ok": true }` always (doesn't expose errors).

---

## Commission Structure

| Tier | Paid Referrals | Commission Rate |
|------|---------------|-----------------|
| 1 | 1–50 | 10% of payment |
| 2 | 51+ | 20% of payment |

- **One-time**: Commission is calculated on the first payment only per referred user
- **No multi-level**: Affiliates only earn from their direct referrals
- Commission rates are configured in `src/config/constants.js`

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/affiliate/register` | POST | Register new affiliate |
| `/api/auth/affiliate/login` | POST | Affiliate login |
| `/api/auth/admin/login` | POST | Admin login |
| `/api/auth/logout` | POST | Logout (clears cookie) |

### Affiliate Endpoints (requires affiliate auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/affiliate/dashboard` | GET | Stats overview |
| `/api/affiliate/referrals` | GET | List referrals (?page, ?status) |
| `/api/affiliate/earnings` | GET | Earnings breakdown |
| `/api/affiliate/link` | GET | Get referral link |
| `/api/affiliate/payouts` | GET | Payout history |
| `/api/affiliate/payout/request` | POST | Request a payout |
| `/api/affiliate/profile` | PUT | Update profile/wallet |

### Admin Endpoints (requires admin auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/dashboard` | GET | Overview stats + charts |
| `/api/admin/affiliates` | GET | List affiliates (?search, ?status, ?page) |
| `/api/admin/affiliates/:id` | GET | Affiliate detail |
| `/api/admin/affiliates/:id/status` | PUT | Update affiliate status |
| `/api/admin/referrals` | GET | All referrals (?status, ?affiliate_id, ?page) |
| `/api/admin/payouts` | GET | All payouts (?status, ?page) |
| `/api/admin/payouts/:id` | PUT | Process payout |
| `/api/admin/webhooks/logs` | GET | Webhook logs (?event_type, ?status, ?page) |

### Webhooks (requires HMAC signature)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/signup` | POST | Record referred user signup |
| `/api/webhooks/payment` | POST | Record payment + calculate commission |

### Other

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/track/click` | GET | Track affiliate link click (?ref=CODE) |

---

## Deployment

### With PM2

```bash
npm install -g pm2
pm2 start src/server.js --name magmaprop-affiliate
pm2 save
pm2 startup
```

### With Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name affiliate.magmaprop.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## File Structure

```
magmaprop-affiliate/
├── src/
│   ├── server.js              # Express app setup
│   ├── config/
│   │   ├── database.js        # PostgreSQL pool
│   │   └── constants.js       # Commission rates, limits
│   ├── controllers/
│   │   ├── adminController.js     # Admin dashboard logic
│   │   ├── affiliateController.js # Affiliate dashboard logic
│   │   ├── authController.js      # Registration, login, JWT
│   │   └── webhookController.js   # Signup & payment processing
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   ├── errorHandler.js    # Global error handler
│   │   ├── validate.js        # Input validation rules
│   │   └── webhook.js         # HMAC signature verification
│   ├── routes/
│   │   ├── admin.js           # Admin API routes
│   │   ├── affiliate.js       # Affiliate API routes
│   │   ├── auth.js            # Auth routes
│   │   └── webhooks.js        # Webhook routes
│   └── db/
│       ├── schema.sql         # Database schema
│       ├── seed.sql           # Initial seed data
│       └── seed-admin.js      # Admin user seeder
├── public/
│   ├── admin/                 # Admin dashboard frontend
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── css/style.css
│   │   └── js/api.js
│   └── affiliate/             # Affiliate dashboard frontend
│       ├── index.html         # Main dashboard
│       ├── login.html
│       ├── register.html
│       ├── referrals.html
│       ├── earnings.html
│       ├── payouts.html
│       ├── settings.html
│       ├── css/style.css
│       └── js/api.js
├── .env.example
├── package.json
└── README.md
```

---

## Security Notes

- **Webhook Secret**: Use a strong random string (32+ chars). Never expose it client-side.
- **JWT Secret**: Use a strong random string. Tokens are stored in httpOnly, secure, sameSite cookies.
- **Admin Password**: Change the default immediately after seeding.
- **HTTPS**: Always use HTTPS in production (required for secure cookies).
- **Rate Limiting**: Auth endpoints: 20 requests/15min. Webhooks: 100 requests/min.

## License

Private — MagmaProp
