// API Request and Response Types

export interface CreateAgreementApiRequest {
  customer: {
    email: string;
    phone: string;
    name: string;
    stripeCustomerId?: string;
  };
  plan: {
    type: 'monthly' | 'semi_annual' | 'annual';
    amount: number; // in DKK (decimal)
    currency: string;
  };
}

export interface CreateAgreementApiResponse {
  success: boolean;
  agreementId: string;
  confirmationUrl: string;
  message?: string;
}

export interface GetAgreementApiResponse {
  success: boolean;
  agreement: {
    id: string;
    mobilepayAgreementId: string;
    status: string;
    amount: number;
    currency: string;
    intervalUnit: string;
    intervalCount: number;
    productName: string;
    productDescription: string;
    createdAt: string;
  };
}

export interface CancelAgreementApiRequest {
  reason?: string;
}

export interface CancelAgreementApiResponse {
  success: boolean;
  message: string;
}

export interface CustomerAgreementsApiResponse {
  success: boolean;
  agreements: Array<{
    id: string;
    mobilepayAgreementId: string;
    status: string;
    amount: number;
    currency: string;
    productName: string;
    nextBillingDate?: string;
    createdAt: string;
  }>;
}

export interface WebhookApiResponse {
  success: boolean;
  message: string;
}

export interface UpcomingChargesApiResponse {
  success: boolean;
  charges: Array<{
    agreementId: string;
    customerEmail: string;
    amount: number;
    currency: string;
    dueDate: string;
    scheduledCreationDate: string;
  }>;
}

export interface RetryChargeApiResponse {
  success: boolean;
  message: string;
}

export interface ErrorApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
