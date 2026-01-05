import { MobilePayConfig } from '../types/mobilepay.types';

const mobilePayConfig: MobilePayConfig = {
  env: (process.env.MOBILEPAY_ENV as 'test' | 'production') || 'test',
  baseUrl: process.env.MOBILEPAY_BASE_URL || 'https://apitest.vipps.no',
  clientId: process.env.MOBILEPAY_CLIENT_ID || '',
  clientSecret: process.env.MOBILEPAY_CLIENT_SECRET || '',
  subscriptionKey: process.env.MOBILEPAY_SUBSCRIPTION_KEY || '',
  merchantSerialNumber: process.env.MOBILEPAY_MERCHANT_SERIAL_NUMBER || '',
};

// Validation
const requiredFields = [
  'clientId',
  'clientSecret',
  'subscriptionKey',
  'merchantSerialNumber',
] as const;

for (const field of requiredFields) {
  if (!mobilePayConfig[field]) {
    throw new Error(`Missing required MobilePay configuration: ${field}`);
  }
}

export default mobilePayConfig;
