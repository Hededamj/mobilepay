import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import webhookHandlerService from '../services/webhook/webhook-handler.service';
import { WebhookEvent } from '../types/mobilepay.types';
import { WebhookApiResponse } from '../types/api.types';
import logger from '../config/logger';

const router = Router();

/**
 * POST /api/v1/webhook
 * Receive MobilePay webhook events
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const event: WebhookEvent = req.body;

    // Log incoming webhook
    logger.info('Webhook received', {
      eventType: event.event,
      timestamp: event.timestamp,
      agreementId: event.data.agreementId,
      chargeId: event.data.chargeId,
    });

    // Verify webhook signature (if configured)
    const signature = req.headers['x-webhook-signature'] as string;
    if (signature && !webhookHandlerService.verifyWebhookSignature(JSON.stringify(event), signature)) {
      logger.warn('Invalid webhook signature', { eventType: event.event });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature verification failed',
        },
      });
    }

    // Process webhook asynchronously
    // We respond immediately and process in background
    webhookHandlerService
      .processWebhook(event)
      .catch((error) => {
        logger.error('Webhook processing error', {
          eventType: event.event,
          error,
        });
      });

    const response: WebhookApiResponse = {
      success: true,
      message: 'Webhook received',
    };

    // Return 200 OK immediately
    res.status(200).json(response);
  })
);

export default router;
