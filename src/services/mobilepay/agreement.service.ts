import axios, { AxiosError } from 'axios';
import mobilePayConfig from '../../config/mobilepay';
import prisma from '../../config/database';
import logger from '../../config/logger';
import authService from './auth.service';
import {
  CreateAgreementRequest,
  CreateAgreementResponse,
  GetAgreementResponse,
  AgreementInterval,
} from '../../types/mobilepay.types';
import { Customer, Agreement } from '@prisma/client';

class AgreementService {
  /**
   * Create a new MobilePay recurring agreement
   */
  async createAgreement(
    customer: Customer,
    planType: 'monthly' | 'semi_annual' | 'annual',
    amount: number, // in DKK (decimal)
    productName: string,
    productDescription: string
  ): Promise<Agreement> {
    try {
      // Determine interval based on plan type
      const interval = this.getIntervalFromPlanType(planType);

      // Convert amount to øre (cents)
      const amountInOre = Math.round(amount * 100);

      // Prepare request
      const requestData: CreateAgreementRequest = {
        pricing: {
          type: 'LEGACY',
          amount: amountInOre,
          currency: 'DKK',
        },
        interval,
        merchantAgreementUrl:
          process.env.MERCHANT_AGREEMENT_URL || 'https://academy.familymind.dk/agreement-details',
        merchantRedirectUrl:
          process.env.MERCHANT_REDIRECT_URL || 'https://academy.familymind.dk/payment/callback',
        productName,
        productDescription,
      };

      // Get access token
      const accessToken = await authService.getAccessToken();

      // Make API request
      const response = await axios.post<CreateAgreementResponse>(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
            'Content-Type': 'application/json',
          },
        }
      );

      const { agreementId, vippsConfirmationUrl } = response.data;

      logger.info('Agreement created successfully', {
        agreementId,
        customerId: customer.id,
        planType,
      });

      // Save agreement to database
      const agreement = await prisma.agreement.create({
        data: {
          customerId: customer.id,
          mobilepayAgreementId: agreementId,
          status: 'pending',
          intervalUnit: interval.unit,
          intervalCount: interval.count,
          amount: amountInOre,
          currency: 'DKK',
          productName,
          productDescription,
          merchantAgreementUrl: requestData.merchantAgreementUrl,
          confirmationUrl: vippsConfirmationUrl,
        },
      });

      return agreement;
    } catch (error) {
      logger.error('Failed to create agreement', {
        error: error instanceof AxiosError ? error.response?.data : error,
        customerId: customer.id,
      });

      throw new Error('Failed to create MobilePay agreement');
    }
  }

  /**
   * Get agreement status from MobilePay
   */
  async getAgreementStatus(mobilepayAgreementId: string): Promise<GetAgreementResponse> {
    try {
      const accessToken = await authService.getAccessToken();

      const response = await axios.get<GetAgreementResponse>(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements/${mobilepayAgreementId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
          },
        }
      );

      logger.debug('Agreement status fetched', {
        agreementId: mobilepayAgreementId,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get agreement status', {
        error: error instanceof AxiosError ? error.response?.data : error,
        agreementId: mobilepayAgreementId,
      });

      throw new Error('Failed to get agreement status from MobilePay');
    }
  }

  /**
   * Update agreement status in database
   */
  async updateAgreementStatus(
    agreementId: string,
    status: 'pending' | 'active' | 'stopped' | 'expired'
  ): Promise<Agreement> {
    const agreement = await prisma.agreement.update({
      where: { id: agreementId },
      data: { status },
    });

    logger.info('Agreement status updated in database', {
      agreementId,
      status,
    });

    return agreement;
  }

  /**
   * Cancel/stop an agreement
   */
  async cancelAgreement(mobilepayAgreementId: string): Promise<void> {
    try {
      const accessToken = await authService.getAccessToken();

      await axios.patch(
        `${mobilePayConfig.baseUrl}/recurring/v3/agreements/${mobilepayAgreementId}`,
        { status: 'STOPPED' },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Agreement cancelled successfully', {
        agreementId: mobilepayAgreementId,
      });

      // Update status in database
      await prisma.agreement.updateMany({
        where: { mobilepayAgreementId },
        data: { status: 'stopped' },
      });
    } catch (error) {
      logger.error('Failed to cancel agreement', {
        error: error instanceof AxiosError ? error.response?.data : error,
        agreementId: mobilepayAgreementId,
      });

      throw new Error('Failed to cancel MobilePay agreement');
    }
  }

  /**
   * Handle agreement stopped event (from webhook)
   */
  async handleAgreementStopped(mobilepayAgreementId: string, actor: string): Promise<void> {
    logger.info('Processing agreement stopped event', {
      agreementId: mobilepayAgreementId,
      actor,
    });

    // Update agreement status
    await prisma.agreement.updateMany({
      where: { mobilepayAgreementId },
      data: { status: 'stopped' },
    });

    // Update subscription status
    const agreement = await prisma.agreement.findFirst({
      where: { mobilepayAgreementId },
      include: { subscriptions: true },
    });

    if (agreement?.subscriptions) {
      for (const subscription of agreement.subscriptions) {
        await prisma.subscriptionSync.update({
          where: { id: subscription.id },
          data: { status: 'cancelled' },
        });
      }
    }

    logger.info('Agreement stopped event processed', {
      agreementId: mobilepayAgreementId,
    });
  }

  /**
   * Helper: Get interval from plan type
   */
  private getIntervalFromPlanType(
    planType: 'monthly' | 'semi_annual' | 'annual'
  ): AgreementInterval {
    switch (planType) {
      case 'monthly':
        return { unit: 'MONTH', count: 1 };
      case 'semi_annual':
        return { unit: 'MONTH', count: 6 };
      case 'annual':
        return { unit: 'YEAR', count: 1 };
      default:
        throw new Error(`Invalid plan type: ${planType}`);
    }
  }
}

export default new AgreementService();
