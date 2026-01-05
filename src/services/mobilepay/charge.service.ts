import axios, { AxiosError } from 'axios';
import mobilePayConfig from '../../config/mobilepay';
import prisma from '../../config/database';
import logger from '../../config/logger';
import authService from './auth.service';
import {
  CreateChargeRequest,
  CreateChargeResponse,
  GetChargeResponse,
} from '../../types/mobilepay.types';
import { Agreement, Charge } from '@prisma/client';

class ChargeService {
  /**
   * Create a charge for an agreement
   */
  async createCharge(
    agreement: Agreement,
    amount: number, // in øre (cents)
    dueDate: Date,
    description: string,
    retryDays: number = 5
  ): Promise<Charge> {
    try {
      // Format due date as YYYY-MM-DD
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Prepare request
      const requestData: CreateChargeRequest = {
        amount,
        currency: agreement.currency,
        description,
        due: dueDateStr,
        retryDays,
        transactionType: 'DIRECT_CAPTURE',
      };

      // Get access token
      const accessToken = await authService.getAccessToken();

      // Make API request
      const response = await axios.post<CreateChargeResponse>(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements/${agreement.mobilepayAgreementId}/charges`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
            'Content-Type': 'application/json',
            'Idempotency-Key': `${agreement.mobilepayAgreementId}-${dueDateStr}`,
          },
        }
      );

      const { chargeId, status } = response.data;

      logger.info('Charge created successfully', {
        chargeId,
        agreementId: agreement.id,
        amount,
        dueDate: dueDateStr,
      });

      // Save charge to database
      const charge = await prisma.charge.create({
        data: {
          agreementId: agreement.id,
          mobilepayChargeId: chargeId,
          amount,
          currency: agreement.currency,
          description,
          dueDate,
          status: status.toLowerCase() as any,
          retryDays,
        },
      });

      return charge;
    } catch (error) {
      logger.error('Failed to create charge', {
        error: error instanceof AxiosError ? error.response?.data : error,
        agreementId: agreement.id,
      });

      throw new Error('Failed to create MobilePay charge');
    }
  }

  /**
   * Get charge status from MobilePay
   */
  async getChargeStatus(
    mobilepayAgreementId: string,
    mobilepayChargeId: string
  ): Promise<GetChargeResponse> {
    try {
      const accessToken = await authService.getAccessToken();

      const response = await axios.get<GetChargeResponse>(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements/${mobilepayAgreementId}/charges/${mobilepayChargeId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
          },
        }
      );

      logger.debug('Charge status fetched', {
        chargeId: mobilepayChargeId,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get charge status', {
        error: error instanceof AxiosError ? error.response?.data : error,
        chargeId: mobilepayChargeId,
      });

      throw new Error('Failed to get charge status from MobilePay');
    }
  }

  /**
   * Update charge status in database
   */
  async updateChargeStatus(
    chargeId: string,
    status:
      | 'pending'
      | 'due'
      | 'reserved'
      | 'charged'
      | 'failed'
      | 'cancelled'
      | 'refunded'
  ): Promise<Charge> {
    const charge = await prisma.charge.update({
      where: { id: chargeId },
      data: { status },
    });

    logger.info('Charge status updated in database', {
      chargeId,
      status,
    });

    return charge;
  }

  /**
   * Cancel a charge
   */
  async cancelCharge(mobilepayAgreementId: string, mobilepayChargeId: string): Promise<void> {
    try {
      const accessToken = await authService.getAccessToken();

      await axios.delete(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements/${mobilepayAgreementId}/charges/${mobilepayChargeId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
          },
        }
      );

      logger.info('Charge cancelled successfully', {
        chargeId: mobilepayChargeId,
      });

      // Update status in database
      await prisma.charge.updateMany({
        where: { mobilepayChargeId },
        data: { status: 'cancelled' },
      });
    } catch (error) {
      logger.error('Failed to cancel charge', {
        error: error instanceof AxiosError ? error.response?.data : error,
        chargeId: mobilepayChargeId,
      });

      throw new Error('Failed to cancel MobilePay charge');
    }
  }

  /**
   * Calculate next billing date based on interval
   */
  calculateNextBillingDate(currentDate: Date, intervalUnit: string, intervalCount: number): Date {
    const nextDate = new Date(currentDate);

    switch (intervalUnit) {
      case 'MONTH':
        nextDate.setMonth(nextDate.getMonth() + intervalCount);
        break;
      case 'YEAR':
        nextDate.setFullYear(nextDate.getFullYear() + intervalCount);
        break;
      case 'WEEK':
        nextDate.setDate(nextDate.getDate() + intervalCount * 7);
        break;
      case 'DAY':
        nextDate.setDate(nextDate.getDate() + intervalCount);
        break;
      default:
        throw new Error(`Invalid interval unit: ${intervalUnit}`);
    }

    return nextDate;
  }

  /**
   * Get charges due for creation (X days from now)
   */
  async getChargesDueForCreation(advanceDays: number): Promise<Agreement[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + advanceDays);
    targetDate.setHours(0, 0, 0, 0);

    // Get all active agreements with subscriptions that have next billing date matching target
    const agreements = await prisma.agreement.findMany({
      where: {
        status: 'active',
        subscriptions: {
          some: {
            status: 'active',
            nextBillingDate: targetDate,
          },
        },
      },
      include: {
        customer: true,
        subscriptions: {
          where: {
            status: 'active',
          },
        },
      },
    });

    return agreements;
  }
}

export default new ChargeService();
