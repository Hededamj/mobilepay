import prisma from '../../config/database';
import logger from '../../config/logger';
import { WebhookEvent } from '../../types/mobilepay.types';
import agreementService from '../mobilepay/agreement.service';
import notificationService from '../notification/notification.service';

class WebhookHandlerService {
  /**
   * Process incoming webhook event
   */
  async processWebhook(event: WebhookEvent): Promise<void> {
    logger.info('Processing webhook event', {
      eventType: event.event,
      agreementId: event.data.agreementId,
      chargeId: event.data.chargeId,
      timestamp: event.timestamp,
    });

    try {
      switch (event.event) {
        case 'recurring.agreement-stopped.v1':
          await this.handleAgreementStopped(event);
          break;

        case 'recurring.charge-created.v1':
          await this.handleChargeCreated(event);
          break;

        case 'recurring.charge-due.v1':
          await this.handleChargeDue(event);
          break;

        case 'recurring.charge-reserved.v1':
          await this.handleChargeReserved(event);
          break;

        case 'recurring.charge-charged.v1':
          await this.handleChargeCharged(event);
          break;

        case 'recurring.charge-failed.v1':
          await this.handleChargeFailed(event);
          break;

        case 'recurring.charge-cancelled.v1':
          await this.handleChargeCancelled(event);
          break;

        default:
          logger.warn('Unknown webhook event type', { eventType: event.event });
      }

      logger.info('Webhook event processed successfully', {
        eventType: event.event,
      });
    } catch (error) {
      logger.error('Failed to process webhook event', {
        eventType: event.event,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle agreement stopped event
   */
  private async handleAgreementStopped(event: WebhookEvent): Promise<void> {
    const { agreementId, actor } = event.data;

    if (!agreementId) {
      throw new Error('Agreement ID missing from webhook event');
    }

    logger.info('Processing agreement stopped event', {
      agreementId,
      actor: actor || 'unknown',
    });

    // Update agreement status in database
    await agreementService.handleAgreementStopped(agreementId, actor || 'UNKNOWN');

    // Get agreement with customer info
    const agreement = await prisma.agreement.findFirst({
      where: { mobilepayAgreementId: agreementId },
      include: {
        customer: true,
        subscriptions: true,
      },
    });

    if (agreement) {
      // Notify FamilyMind to cancel Stripe subscription
      await notificationService.notifyAgreementCancelled(agreement as any);
    }
  }

  /**
   * Handle charge created event
   */
  private async handleChargeCreated(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.debug('Charge created event received', { chargeId });

    // Update charge status to pending if exists
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'pending' },
    });
  }

  /**
   * Handle charge due event
   */
  private async handleChargeDue(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.info('Charge is now due', { chargeId });

    // Update charge status to due
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'due' },
    });
  }

  /**
   * Handle charge reserved event
   */
  private async handleChargeReserved(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.info('Charge reserved (RESERVE_CAPTURE)', { chargeId });

    // Update charge status to reserved
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'reserved' },
    });
  }

  /**
   * Handle charge charged (successful payment)
   */
  private async handleChargeCharged(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.info('Charge successful', { chargeId });

    // Update charge status to charged
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'charged' },
    });

    // Get charge with agreement and customer info
    const chargeData = await prisma.charge.findFirst({
      where: { mobilepayChargeId: chargeId },
      include: {
        agreement: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (chargeData) {
      // Notify FamilyMind of successful payment
      await notificationService.notifyChargeSuccess(chargeData as any);
    }
  }

  /**
   * Handle charge failed event
   */
  private async handleChargeFailed(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.warn('Charge failed', { chargeId });

    // Update charge status to failed
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'failed' },
    });

    // Get charge with agreement and customer info
    const chargeData = await prisma.charge.findFirst({
      where: { mobilepayChargeId: chargeId },
      include: {
        agreement: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (chargeData) {
      // Notify FamilyMind of failed payment
      await notificationService.notifyChargeFailed(chargeData as any);
    }
  }

  /**
   * Handle charge cancelled event
   */
  private async handleChargeCancelled(event: WebhookEvent): Promise<void> {
    const { chargeId } = event.data;

    if (!chargeId) {
      throw new Error('Charge ID missing from webhook event');
    }

    logger.info('Charge cancelled', { chargeId });

    // Update charge status to cancelled
    await prisma.charge.updateMany({
      where: { mobilepayChargeId: chargeId },
      data: { status: 'cancelled' },
    });
  }

  /**
   * Verify webhook signature (implement based on MobilePay documentation)
   */
  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // TODO: Implement signature verification using webhook secret
    // For now, return true (implement properly in production)
    logger.warn('Webhook signature verification not implemented');
    return true;
  }
}

export default new WebhookHandlerService();
