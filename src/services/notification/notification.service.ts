import axios, { AxiosError } from 'axios';
import logger from '../../config/logger';

class NotificationService {
  private readonly familyMindApiUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number = 3;

  constructor() {
    this.familyMindApiUrl = process.env.FAMILYMIND_API_URL || '';
    this.apiKey = process.env.FAMILYMIND_API_KEY || '';

    if (!this.familyMindApiUrl || !this.apiKey) {
      logger.warn('FamilyMind API configuration missing - notifications disabled');
    }
  }

  /**
   * Notify FamilyMind when an agreement is cancelled
   */
  async notifyAgreementCancelled(agreement: any): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Notification skipped - API not configured');
      return;
    }

    const payload = {
      event: 'mobilepay.agreement.cancelled',
      data: {
        agreementId: agreement.id,
        mobilepayAgreementId: agreement.mobilepayAgreementId,
        customerId: agreement.customer.id,
        customerEmail: agreement.customer.email,
        stripeCustomerId: agreement.customer.stripeCustomerId,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendNotification('/webhooks/mobilepay/agreement-cancelled', payload);
  }

  /**
   * Notify FamilyMind when a charge succeeds
   */
  async notifyChargeSuccess(charge: any): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Notification skipped - API not configured');
      return;
    }

    const payload = {
      event: 'mobilepay.charge.success',
      data: {
        chargeId: charge.id,
        mobilepayChargeId: charge.mobilepayChargeId,
        agreementId: charge.agreement.id,
        customerId: charge.agreement.customer.id,
        customerEmail: charge.agreement.customer.email,
        stripeCustomerId: charge.agreement.customer.stripeCustomerId,
        amount: charge.amount / 100, // Convert øre to DKK
        currency: charge.currency,
        dueDate: charge.dueDate,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendNotification('/webhooks/mobilepay/charge-success', payload);
  }

  /**
   * Notify FamilyMind when a charge fails
   */
  async notifyChargeFailed(charge: any): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Notification skipped - API not configured');
      return;
    }

    const payload = {
      event: 'mobilepay.charge.failed',
      data: {
        chargeId: charge.id,
        mobilepayChargeId: charge.mobilepayChargeId,
        agreementId: charge.agreement.id,
        customerId: charge.agreement.customer.id,
        customerEmail: charge.agreement.customer.email,
        stripeCustomerId: charge.agreement.customer.stripeCustomerId,
        amount: charge.amount / 100, // Convert øre to DKK
        currency: charge.currency,
        dueDate: charge.dueDate,
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendNotification('/webhooks/mobilepay/charge-failed', payload);
  }

  /**
   * Notify FamilyMind when an agreement is activated
   */
  async notifyAgreementActivated(agreement: any): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Notification skipped - API not configured');
      return;
    }

    const payload = {
      event: 'mobilepay.agreement.activated',
      data: {
        agreementId: agreement.id,
        mobilepayAgreementId: agreement.mobilepayAgreementId,
        customerId: agreement.customer.id,
        customerEmail: agreement.customer.email,
        stripeCustomerId: agreement.customer.stripeCustomerId,
        amount: agreement.amount / 100, // Convert øre to DKK
        currency: agreement.currency,
        planType: agreement.intervalUnit === 'MONTH' && agreement.intervalCount === 1
          ? 'monthly'
          : agreement.intervalUnit === 'MONTH' && agreement.intervalCount === 6
          ? 'semi_annual'
          : 'annual',
        timestamp: new Date().toISOString(),
      },
    };

    await this.sendNotification('/webhooks/mobilepay/agreement-activated', payload);
  }

  /**
   * Send notification to FamilyMind API with retry logic
   */
  private async sendNotification(endpoint: string, payload: any): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info('Sending notification to FamilyMind', {
          endpoint,
          attempt,
          event: payload.event,
        });

        await axios.post(`${this.familyMindApiUrl}${endpoint}`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          timeout: 10000, // 10 seconds
        });

        logger.info('Notification sent successfully', {
          endpoint,
          event: payload.event,
        });

        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;

        logger.warn('Notification failed', {
          endpoint,
          attempt,
          maxRetries: this.maxRetries,
          error: error instanceof AxiosError ? error.response?.data : error,
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('Notification failed after all retries', {
      endpoint,
      maxRetries: this.maxRetries,
      error: lastError,
    });

    // Don't throw error - we don't want to fail the webhook processing
    // Just log it for manual intervention
  }

  /**
   * Check if notification service is configured
   */
  private isConfigured(): boolean {
    return !!(this.familyMindApiUrl && this.apiKey);
  }

  /**
   * Sleep helper for retry logic
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new NotificationService();
