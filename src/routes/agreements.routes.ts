import { Router, Request, Response } from 'express';
import Joi from 'joi';
import prisma from '../config/database';
import agreementService from '../services/mobilepay/agreement.service';
import notificationService from '../services/notification/notification.service';
import { asyncHandler } from '../middleware/error.middleware';
import { validateBody, validateParams, schemas } from '../middleware/validation.middleware';
import { authenticateApiKey } from '../middleware/auth.middleware';
import {
  CreateAgreementApiRequest,
  CreateAgreementApiResponse,
  GetAgreementApiResponse,
  CancelAgreementApiResponse,
  CustomerAgreementsApiResponse,
} from '../types/api.types';

const router = Router();

/**
 * POST /api/v1/agreements
 * Create a new MobilePay recurring agreement
 */
router.post(
  '/',
  authenticateApiKey,
  validateBody(schemas.createAgreement),
  asyncHandler(async (req: Request, res: Response) => {
    const { customer, plan }: CreateAgreementApiRequest = req.body;

    // Find or create customer
    let customerRecord = await prisma.customer.findFirst({
      where: { email: customer.email },
    });

    if (!customerRecord) {
      customerRecord = await prisma.customer.create({
        data: {
          email: customer.email,
          phone: customer.phone,
          name: customer.name,
          stripeCustomerId: customer.stripeCustomerId,
        },
      });
    }

    // Create agreement
    const productName =
      plan.type === 'monthly'
        ? 'FamilyMind Månedligt Abonnement'
        : plan.type === 'semi_annual'
        ? 'FamilyMind Halvårligt Abonnement'
        : 'FamilyMind Årligt Abonnement';

    const productDescription = 'Adgang til FamilyMind Academy med alle kurser og materialer';

    const agreement = await agreementService.createAgreement(
      customerRecord,
      plan.type,
      plan.amount,
      productName,
      productDescription
    );

    // Create subscription sync record
    const nextBillingDate = new Date();
    if (plan.type === 'monthly') {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    } else if (plan.type === 'semi_annual') {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 6);
    } else {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    }

    await prisma.subscriptionSync.create({
      data: {
        customerId: customerRecord.id,
        agreementId: agreement.id,
        paymentMethod: 'mobilepay',
        planType: plan.type,
        status: 'active',
        nextBillingDate,
      },
    });

    const response: CreateAgreementApiResponse = {
      success: true,
      agreementId: agreement.id,
      confirmationUrl: agreement.confirmationUrl || '',
      message: 'Agreement created successfully. Redirect user to confirmationUrl.',
    };

    res.status(201).json(response);
  })
);

/**
 * GET /api/v1/agreements/:id
 * Get agreement status
 */
router.get(
  '/:id',
  authenticateApiKey,
  validateParams(Joi.object({ id: schemas.uuid })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const agreement = await prisma.agreement.findUnique({
      where: { id },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agreement not found',
        },
      });
    }

    // Optionally fetch latest status from MobilePay
    try {
      const mobilePayStatus = await agreementService.getAgreementStatus(
        agreement.mobilepayAgreementId
      );

      const oldStatus = agreement.status;
      const newStatus = mobilePayStatus.status.toLowerCase();

      // Update status if changed
      if (newStatus !== oldStatus) {
        await agreementService.updateAgreementStatus(
          agreement.id,
          newStatus as any
        );

        // If agreement became active, trigger enrollment
        if (oldStatus === 'pending' && newStatus === 'active') {
          // Get full agreement with customer data
          const fullAgreement = await prisma.agreement.findUnique({
            where: { id: agreement.id },
            include: { customer: true },
          });

          if (fullAgreement) {
            // Trigger New Zenler enrollment and FamilyMind notification
            await notificationService.notifyAgreementActivated(fullAgreement);
          }
        }
      }
    } catch (error) {
      // Continue with database status if API call fails
    }

    // Get updated agreement
    const updatedAgreement = await prisma.agreement.findUnique({
      where: { id },
    });

    const response: GetAgreementApiResponse = {
      success: true,
      agreement: {
        id: updatedAgreement!.id,
        mobilepayAgreementId: updatedAgreement!.mobilepayAgreementId,
        status: updatedAgreement!.status,
        amount: updatedAgreement!.amount / 100, // Convert to DKK
        currency: updatedAgreement!.currency,
        intervalUnit: updatedAgreement!.intervalUnit,
        intervalCount: updatedAgreement!.intervalCount,
        productName: updatedAgreement!.productName,
        productDescription: updatedAgreement!.productDescription,
        createdAt: updatedAgreement!.createdAt.toISOString(),
      },
    };

    return res.json(response);
  })
);

/**
 * POST /api/v1/agreements/:id/cancel
 * Cancel an agreement
 */
router.post(
  '/:id/cancel',
  authenticateApiKey,
  validateParams(Joi.object({ id: schemas.uuid })),
  validateBody(schemas.cancelAgreement),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const agreement = await prisma.agreement.findUnique({
      where: { id },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agreement not found',
        },
      });
    }

    // Cancel agreement via MobilePay API
    await agreementService.cancelAgreement(agreement.mobilepayAgreementId);

    const response: CancelAgreementApiResponse = {
      success: true,
      message: 'Agreement cancelled successfully',
    };

    return res.json(response);
  })
);

/**
 * GET /api/v1/customers/:customerId/agreements
 * List all agreements for a customer
 */
router.get(
  '/customers/:customerId/agreements',
  authenticateApiKey,
  validateParams(Joi.object({ customerId: schemas.uuid })),
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = String(req.params.customerId);

    const agreements = await prisma.agreement.findMany({
      where: { customerId },
      include: {
        subscriptions: {
          where: { status: 'active' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: CustomerAgreementsApiResponse = {
      success: true,
      agreements: agreements.map((agreement) => ({
        id: agreement.id,
        mobilepayAgreementId: agreement.mobilepayAgreementId,
        status: agreement.status,
        amount: agreement.amount / 100, // Convert to DKK
        currency: agreement.currency,
        productName: agreement.productName,
        nextBillingDate: agreement.subscriptions[0]?.nextBillingDate.toISOString(),
        createdAt: agreement.createdAt.toISOString(),
      })),
    };

    res.json(response);
  })
);

export default router;
