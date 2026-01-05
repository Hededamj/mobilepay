# MobilePay Recurring Payment Integration

REST API service for integrating MobilePay Recurring payments as an alternative payment method for FamilyMind's subscription service.

## Overview

This service handles automatic recurring charges for monthly, semi-annual, and annual subscriptions using the Vipps MobilePay Recurring API v3.

### Features

- MobilePay Recurring payment integration
- Automatic charge scheduling (charges created 3 days before due date)
- Webhook handling for real-time status updates
- PostgreSQL database for persistence
- Bull queue for job scheduling
- TypeScript for type safety
- Comprehensive error handling and logging

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Job Scheduler**: Bull (Redis-based queue)
- **HTTP Client**: Axios
- **Validation**: Joi
- **Testing**: Jest + Supertest
- **Logging**: Winston

## Prerequisites

- Node.js 18 or higher
- PostgreSQL database
- Redis (for Bull queue)
- MobilePay test credentials (from portal.vippsmobilepay.com)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Hededamj/mobilepay.git
cd mobilepay
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mobilepay

# Redis
REDIS_URL=redis://localhost:6379

# MobilePay API
MOBILEPAY_ENV=test
MOBILEPAY_BASE_URL=https://apitest.vipps.no
MOBILEPAY_CLIENT_ID=your-client-id
MOBILEPAY_CLIENT_SECRET=your-client-secret
MOBILEPAY_SUBSCRIPTION_KEY=your-subscription-key
MOBILEPAY_MERCHANT_SERIAL_NUMBER=your-merchant-number

# URLs
MERCHANT_AGREEMENT_URL=https://academy.familymind.dk/agreement-details
MERCHANT_REDIRECT_URL=https://academy.familymind.dk/payment/callback
```

4. Set up the database:
```bash
npm run prisma:migrate
npm run prisma:generate
```

## Development

Start development server:
```bash
npm run dev
```

## Database Schema

### Tables

- **customers**: Customer information and Stripe customer ID linkage
- **agreements**: MobilePay agreement data and status
- **charges**: Charge history and status tracking
- **subscription_sync**: Links between customers, agreements, and Stripe subscriptions

See `prisma/schema.prisma` for complete schema.

## API Endpoints

### Public API

- `POST /api/v1/agreements` - Create new MobilePay agreement
- `GET /api/v1/agreements/:id` - Get agreement status
- `POST /api/v1/agreements/:id/cancel` - Cancel agreement
- `GET /api/v1/customers/:customerId/agreements` - List customer agreements
- `POST /api/v1/webhook` - Receive MobilePay webhooks

### Admin API

- `GET /api/v1/admin/charges/upcoming` - List upcoming charges
- `POST /api/v1/admin/charges/:id/retry` - Retry failed charge

## Payment Flow

1. **User selects MobilePay at checkout**
   - FamilyMind site calls `POST /api/v1/agreements`
   - Service creates agreement via MobilePay API
   - Returns confirmation URL for redirect

2. **User accepts agreement in MobilePay app**
   - User reviews and accepts in MobilePay
   - MobilePay redirects back to merchant site
   - Agreement status becomes ACTIVE

3. **Automatic charge creation**
   - Background job runs daily at 2 AM
   - Creates charges 3 days before due date
   - Stores charge in database

4. **Charge processing**
   - MobilePay captures payment on due date
   - Sends webhook with status update
   - Service updates database

5. **Webhook handling**
   - Processes status updates
   - Syncs with Stripe subscription
   - Handles cancellations

## Project Structure

```
mobilepay/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.ts
│   │   ├── mobilepay.ts
│   │   ├── queue.ts
│   │   └── logger.ts
│   ├── services/
│   │   ├── mobilepay/   # MobilePay API integration
│   │   │   ├── auth.service.ts
│   │   │   ├── agreement.service.ts
│   │   │   └── charge.service.ts
│   │   ├── scheduler/   # Charge scheduling
│   │   ├── webhook/     # Webhook handling
│   │   └── notification/
│   ├── routes/          # Express routes
│   ├── middleware/      # Express middleware
│   ├── types/           # TypeScript types
│   └── app.ts           # Express app
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/
└── package.json
```

## Current Implementation Status

✅ Phase 1: Project Setup
- Node.js + TypeScript project initialized
- Dependencies installed
- Project structure created
- Environment configuration set up

✅ Phase 2: Database Setup
- Prisma schema designed
- Database models created (customers, agreements, charges, subscription_sync)

✅ Phase 3: Core Services (In Progress)
- ✅ Access Token Service (OAuth 2.0)
- ✅ Agreement Service (create, status, cancel)
- ✅ Charge Service (create, status, cancel)
- ⏳ Charge Scheduler Service
- ⏳ Webhook Handler Service
- ⏳ Notification Service

⏳ Phase 4: API Endpoints
⏳ Phase 5: Scheduler
⏳ Phase 6: Webhooks
⏳ Phase 7: Integration with FamilyMind
⏳ Phase 8: Testing & Deployment

## Next Steps

1. Complete remaining services (scheduler, webhook, notification)
2. Implement Express routes and controllers
3. Add validation middleware
4. Set up Bull queue for charge scheduling
5. Implement webhook handlers
6. Add comprehensive testing
7. Deploy to production

## Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Documentation

- [MobilePay Recurring API Guide](https://developer.vippsmobilepay.com/docs/APIs/recurring-api/recurring-api-guide/)
- [Implementation Plan](C:\Users\jacob.hummel\.claude\plans\golden-swimming-blanket.md)

## License

MIT

## Author

FamilyMind
