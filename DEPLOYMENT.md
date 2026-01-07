# Railway Deployment Guide

Komplet guide til at deploye MobilePay Recurring API til Railway.app

## Trin 1: Opret Railway Account

1. Gå til **https://railway.app**
2. Klik på "Start a New Project"
3. Log ind med GitHub (anbefalet - giver automatisk deployment)

## Trin 2: Opret nyt projekt på Railway

1. I Railway dashboard, klik **"New Project"**
2. Vælg **"Deploy from GitHub repo"**
3. Vælg dit repository: **Hededamj/mobilepay**
4. Railway scanner dit projekt og detecterer Node.js automatisk

## Trin 3: Tilføj PostgreSQL Database

1. I dit Railway projekt, klik **"+ New"**
2. Vælg **"Database"** → **"Add PostgreSQL"**
3. Railway opretter automatisk en PostgreSQL database
4. Database URL sættes automatisk i `DATABASE_URL` environment variable

## Trin 4: Tilføj Redis

1. Klik **"+ New"** igen
2. Vælg **"Database"** → **"Add Redis"**
3. Railway opretter Redis instance
4. Redis URL sættes automatisk i `REDIS_URL` environment variable

## Trin 5: Konfigurer Environment Variables

I din Railway app service, gå til **"Variables"** tab og tilføj følgende:

### Required Variables (MobilePay):
```
MOBILEPAY_ENV=test
MOBILEPAY_BASE_URL=https://apitest.vipps.no
MOBILEPAY_CLIENT_ID=your-test-client-id
MOBILEPAY_CLIENT_SECRET=your-test-client-secret
MOBILEPAY_SUBSCRIPTION_KEY=your-subscription-key
MOBILEPAY_MERCHANT_SERIAL_NUMBER=your-merchant-number
```

### Application Configuration:
```
NODE_ENV=production
PORT=3000
```

### URLs (opdater med din Railway URL efter deployment):
```
MERCHANT_AGREEMENT_URL=https://academy.familymind.dk/agreement-details
MERCHANT_REDIRECT_URL=https://academy.familymind.dk/payment/callback
API_BASE_URL=https://mobilepay-production.up.railway.app
```

### FamilyMind Integration:
```
FAMILYMIND_API_URL=https://academy.familymind.dk/api
FAMILYMIND_API_KEY=your-shared-secret-key
```

### New Zenler Integration (Course Platform):
```
NEW_ZENLER_API_KEY=your-api-key-from-newzenler
NEW_ZENLER_ACCOUNT_NAME=your-subdomain
NEW_ZENLER_ALL_COURSES_IDS=course-id-1,course-id-2,course-id-3
```

**How to get New Zenler credentials:**
1. Log in to your New Zenler account
2. Go to **Settings** → **API Keys**
3. Create new API key or copy existing
4. Account name is your subdomain (e.g., if your site is `yourname.newzenler.com`, use `yourname`)
5. Get course IDs from course URLs or API

### Security:
```
JWT_SECRET=your-strong-jwt-secret-here
WEBHOOK_SECRET=mobilepay-webhook-secret
```

### Scheduler:
```
CHARGE_SCHEDULER_CRON=0 2 * * *
CHARGE_ADVANCE_DAYS=3
LOG_LEVEL=info
```

**Note:** `DATABASE_URL` og `REDIS_URL` sættes automatisk af Railway når du tilføjer database services.

## Trin 6: Deploy Første Gang

Railway deployer automatisk når du har tilføjet environment variables.

For at force en ny deployment:
1. Gå til **"Deployments"** tab
2. Klik **"Redeploy"** på seneste deployment

Eller push til GitHub:
```bash
git push origin main
```

## Trin 7: Kør Database Migrations

Efter første deployment skal du køre Prisma migrations:

1. Gå til din Railway app service
2. Klik på **"Settings"** tab
3. Find **"Service Domains"** og klik **"Generate Domain"**
4. Du får nu en public URL: `https://mobilepay-production.up.railway.app`

5. Kør migrations via Railway CLI eller direkte:

### Option A: Via Railway CLI (Anbefalet)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link til dit projekt
railway link

# Kør migrations
railway run npm run prisma:migrate:deploy
```

### Option B: Via Web Terminal (i Railway Dashboard)
1. Gå til din service i Railway
2. Klik på **"..."** menu → **"Service Settings"**
3. Under **"Deploy"**, tilføj custom build command:
```
npm install && npx prisma generate && npx prisma migrate deploy && npm run build
```

## Trin 8: Verificer Deployment

### Check Health Endpoint:
```bash
curl https://your-app.up.railway.app/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-05T22:00:00.000Z",
  "uptime": 123.45,
  "environment": "production"
}
```

### Check Logs:
1. I Railway dashboard, gå til **"Deployments"** tab
2. Klik på seneste deployment
3. Se logs for errors

### Verificer Services:
```bash
# Test database connection
railway run npx prisma db pull

# Check Redis connection
# (Se logs for "Charge scheduler started")
```

## Trin 9: Test MobilePay Integration

### Create Test Agreement:
```bash
curl -X POST https://your-app.up.railway.app/api/v1/agreements \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "customer": {
      "email": "test@example.com",
      "phone": "+4512345678",
      "name": "Test User"
    },
    "plan": {
      "type": "monthly",
      "amount": 299,
      "currency": "DKK"
    }
  }'
```

### Response:
```json
{
  "success": true,
  "agreementId": "uuid-here",
  "confirmationUrl": "https://apitest.vipps.no/dwo-api-application/v1/...",
  "message": "Agreement created successfully..."
}
```

## Trin 10: Konfigurer MobilePay Webhooks

1. Log ind på **https://portal.vippsmobilepay.com**
2. Gå til dit test merchant account
3. Find **"Webhooks"** section
4. Tilføj webhook URL:
```
https://your-app.up.railway.app/api/v1/webhook
```
5. Vælg events:
   - `recurring.agreement-stopped.v1`
   - `recurring.charge-charged.v1`
   - `recurring.charge-failed.v1`

## Trin 11: Opdater FamilyMind Site

I dit FamilyMind Next.js projekt, opdater API URLs:

```javascript
// config/mobilepay.js
export const MOBILEPAY_API_URL = 'https://your-app.up.railway.app';

// Checkout flow
const response = await fetch(`${MOBILEPAY_API_URL}/api/v1/agreements`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.MOBILEPAY_API_KEY,
  },
  body: JSON.stringify({ customer, plan }),
});
```

## Automatisk Deployment

Railway har automatisk deployment fra GitHub:

```bash
# Lav ændringer
git add .
git commit -m "Update feature"
git push origin main

# Railway deployer automatisk! 🚀
```

## Monitoring & Logs

### View Logs:
1. Railway Dashboard → Dit projekt
2. Klik på service → **"Deployments"**
3. Se real-time logs

### Metrics:
- CPU usage
- Memory usage
- Network traffic
- Request count

## Troubleshooting

### App crasher efter deployment:
```bash
# Check logs i Railway dashboard
# Typiske problemer:
# 1. Missing environment variables
# 2. Database migration ikke kørt
# 3. Port configuration (skal bruge $PORT fra Railway)
```

### Database connection fejler:
```bash
# Verificer DATABASE_URL er sat
railway variables

# Test connection
railway run npx prisma db pull
```

### Redis connection fejler:
```bash
# Verificer REDIS_URL er sat
railway variables

# Check Redis service status i Railway dashboard
```

## Production Checklist

Før du går live med rigtige kunder:

- [ ] Skift til production MobilePay credentials
- [ ] Opdater `MOBILEPAY_ENV=production`
- [ ] Opdater `MOBILEPAY_BASE_URL=https://api.vipps.no`
- [ ] Test fuld payment flow med rigtig MobilePay app
- [ ] Setup monitoring og alerts
- [ ] Backup strategi for database
- [ ] Rate limiting konfigureret korrekt
- [ ] Error tracking (Sentry, LogRocket, etc.)
- [ ] Webhook retry logic testet

## Pricing

**Railway Gratis Tier:**
- $5 kredit per måned
- ~500 timer kørsel
- PostgreSQL + Redis inkluderet
- Perfekt til test

**Estimeret månedlig pris (når i produktion):**
- Hobby: $5-10/måned
- Light usage: $10-20/måned
- Medium usage: $20-40/måned

## Support

**Railway Documentation:**
- https://docs.railway.app

**Railway Community:**
- Discord: https://discord.gg/railway

**MobilePay Support:**
- https://developer.vippsmobilepay.com/docs/

## Næste Skridt

Efter deployment:
1. Test med MobilePay test app
2. Monitor logs for errors
3. Test webhook events
4. Verificer charge scheduler kører
5. Integration med FamilyMind frontend
