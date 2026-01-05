// MobilePay API Type Definitions
// Based on Vipps MobilePay Recurring API v3

export interface MobilePayConfig {
  env: 'test' | 'production';
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  merchantSerialNumber: string;
}

// Access Token Types
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  ext_expires_in: number;
}

// Agreement Types
export type IntervalUnit = 'MONTH' | 'YEAR' | 'WEEK' | 'DAY';
export type AgreementStatus = 'PENDING' | 'ACTIVE' | 'STOPPED' | 'EXPIRED';
export type PricingType = 'LEGACY';

export interface AgreementInterval {
  unit: IntervalUnit;
  count: number; // 1-31
}

export interface AgreementPricing {
  type: PricingType;
  amount: number; // in øre (cents)
  currency: string; // DKK, NOK, EUR
}

export interface CreateAgreementRequest {
  pricing: AgreementPricing;
  interval: AgreementInterval;
  merchantAgreementUrl: string;
  merchantRedirectUrl: string;
  productName: string;
  productDescription: string;
  initialCharge?: InitialCharge;
}

export interface InitialCharge {
  amount: number; // in øre (cents)
  currency: string;
  description: string;
  transactionType?: 'DIRECT_CAPTURE' | 'RESERVE_CAPTURE';
}

export interface CreateAgreementResponse {
  agreementId: string;
  agreementResource: string;
  vippsConfirmationUrl: string;
}

export interface GetAgreementResponse {
  id: string;
  status: AgreementStatus;
  pricing: AgreementPricing;
  interval: AgreementInterval;
  start?: string; // ISO 8601 date
  stop?: string; // ISO 8601 date
  productName: string;
  productDescription: string;
  campaign?: Campaign;
}

export interface Campaign {
  type: 'LEGACY' | 'PRICE_CAMPAIGN' | 'PERIOD_CAMPAIGN';
  price?: number;
  period?: AgreementInterval;
}

// Charge Types
export type ChargeStatus =
  | 'PENDING'
  | 'DUE'
  | 'RESERVED'
  | 'CHARGED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type TransactionType = 'DIRECT_CAPTURE' | 'RESERVE_CAPTURE';

export interface CreateChargeRequest {
  amount: number; // in øre (cents)
  currency: string;
  description: string;
  due: string; // ISO 8601 date (YYYY-MM-DD)
  retryDays: number; // 0-14
  transactionType?: TransactionType;
  externalId?: string;
}

export interface CreateChargeResponse {
  chargeId: string;
  status: ChargeStatus;
  due: string;
  amount: number;
  currency: string;
}

export interface GetChargeResponse {
  id: string;
  status: ChargeStatus;
  due: string;
  amount: number;
  amountRefunded?: number;
  currency: string;
  description: string;
  transactionId?: string;
  type: TransactionType;
}

// Webhook Types
export type WebhookEventType =
  | 'recurring.agreement-stopped.v1'
  | 'recurring.charge-created.v1'
  | 'recurring.charge-due.v1'
  | 'recurring.charge-reserved.v1'
  | 'recurring.charge-charged.v1'
  | 'recurring.charge-failed.v1'
  | 'recurring.charge-cancelled.v1';

export interface WebhookEvent {
  msn: string; // Merchant Serial Number
  timestamp: string; // ISO 8601
  event: WebhookEventType;
  data: WebhookEventData;
}

export interface WebhookEventData {
  agreementId?: string;
  chargeId?: string;
  status?: string;
  actor?: 'USER' | 'MERCHANT' | 'SYSTEM';
}

// Error Types
export interface MobilePayError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: ErrorDetail[];
}

export interface ErrorDetail {
  field: string;
  message: string;
}

// API Response Wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: MobilePayError;
}
