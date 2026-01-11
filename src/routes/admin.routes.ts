import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import chargeService from '../services/mobilepay/charge.service';
import chargeSchedulerService from '../services/scheduler/charge-scheduler.service';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { UpcomingChargesApiResponse, RetryChargeApiResponse } from '../types/api.types';

const router = Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/v1/admin/charges/upcoming
 * List charges scheduled for creation in the next 7 days
 */
router.get(
  '/charges/upcoming',
  asyncHandler(async (req: Request, res: Response) => {
    const daysAhead = parseInt(String(req.query.days || '7'), 10);

    const upcomingCharges = [];

    // Check each day for the next X days
    for (let i = 1; i <= daysAhead; i++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() + i);
      checkDate.setHours(0, 0, 0, 0);

      const subscriptions = await prisma.subscriptionSync.findMany({
        where: {
          status: 'active',
          paymentMethod: 'mobilepay',
          nextBillingDate: checkDate,
          agreement: {
            status: 'active',
          },
        },
        include: {
          agreement: {
            include: {
              customer: true,
            },
          },
        },
      });

      for (const subscription of subscriptions) {
        if (!subscription.agreement) continue;

        // Calculate when charge will be created (X days before due date)
        const advanceDays = parseInt(process.env.CHARGE_ADVANCE_DAYS || '3', 10);
        const scheduledCreationDate = new Date(checkDate);
        scheduledCreationDate.setDate(scheduledCreationDate.getDate() - advanceDays);

        upcomingCharges.push({
          agreementId: subscription.agreement.id,
          customerEmail: subscription.agreement.customer.email,
          amount: subscription.agreement.amount / 100, // Convert to DKK
          currency: subscription.agreement.currency,
          dueDate: checkDate.toISOString().split('T')[0],
          scheduledCreationDate: scheduledCreationDate.toISOString().split('T')[0],
        });
      }
    }

    const response: UpcomingChargesApiResponse = {
      success: true,
      charges: upcomingCharges,
    };

    res.json(response);
  })
);

/**
 * POST /api/v1/admin/charges/:id/retry
 * Manually retry a failed charge
 */
router.post(
  '/charges/:id/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const charge = await prisma.charge.findUnique({
      where: { id },
      include: {
        agreement: true,
      },
    });

    if (!charge || !charge.agreement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Charge or agreement not found',
        },
      });
    }

    if (charge.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Can only retry failed charges',
        },
      });
    }

    // Create new charge with same details
    const newCharge = await chargeService.createCharge(
      charge.agreement,
      charge.amount,
      charge.dueDate,
      charge.description,
      charge.retryDays
    );

    const response: RetryChargeApiResponse = {
      success: true,
      message: `New charge created: ${newCharge.mobilepayChargeId}`,
    };

    res.json(response);
  })
);

/**
 * POST /api/v1/admin/scheduler/trigger
 * Manually trigger the charge scheduler
 */
router.post(
  '/scheduler/trigger',
  asyncHandler(async (_req: Request, res: Response) => {
    await chargeSchedulerService.triggerManually();

    res.json({
      success: true,
      message: 'Charge scheduler triggered successfully',
    });
  })
);

/**
 * GET /api/v1/admin/stats
 * Get system statistics
 */
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const [
      totalCustomers,
      totalAgreements,
      activeAgreements,
      totalCharges,
      chargedCount,
      failedCount,
      activeSubscriptions,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.agreement.count(),
      prisma.agreement.count({ where: { status: 'active' } }),
      prisma.charge.count(),
      prisma.charge.count({ where: { status: 'charged' } }),
      prisma.charge.count({ where: { status: 'failed' } }),
      prisma.subscriptionSync.count({ where: { status: 'active' } }),
    ]);

    res.json({
      success: true,
      stats: {
        customers: totalCustomers,
        agreements: {
          total: totalAgreements,
          active: activeAgreements,
        },
        charges: {
          total: totalCharges,
          charged: chargedCount,
          failed: failedCount,
          successRate: totalCharges > 0 ? ((chargedCount / totalCharges) * 100).toFixed(2) + '%' : '0%',
        },
        subscriptions: {
          active: activeSubscriptions,
        },
      },
    });
  })
);

export default router;
