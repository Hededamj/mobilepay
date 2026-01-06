import cron from 'node-cron';
import prisma from '../../config/database';
import logger from '../../config/logger';
import chargeService from '../mobilepay/charge.service';
import chargeQueue from '../../config/queue';

class ChargeSchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private readonly advanceDays: number;

  constructor() {
    this.advanceDays = parseInt(process.env.CHARGE_ADVANCE_DAYS || '3', 10);
  }

  /**
   * Start the charge scheduler
   */
  start(): void {
    // Default cron: daily at 2 AM
    const cronSchedule = process.env.CHARGE_SCHEDULER_CRON || '0 2 * * *';

    this.cronJob = cron.schedule(cronSchedule, async () => {
      logger.info('Charge scheduler started');
      await this.scheduleUpcomingCharges();
    });

    logger.info(`Charge scheduler started with cron: ${cronSchedule}`);
  }

  /**
   * Stop the charge scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Charge scheduler stopped');
    }
  }

  /**
   * Main scheduling logic - find and create charges
   */
  async scheduleUpcomingCharges(): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      // Calculate target date (X days from now)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + this.advanceDays);
      targetDate.setHours(0, 0, 0, 0);

      logger.info('Searching for agreements with upcoming billing dates', {
        targetDate: targetDate.toISOString(),
        advanceDays: this.advanceDays,
      });

      // Find all active agreements with subscriptions due on target date
      const subscriptions = await prisma.subscriptionSync.findMany({
        where: {
          status: 'active',
          paymentMethod: 'mobilepay',
          nextBillingDate: targetDate,
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

      logger.info(`Found ${subscriptions.length} subscriptions due for charge creation`);

      // Process each subscription
      for (const subscription of subscriptions) {
        try {
          await this.createChargeForSubscription(subscription as any);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to create charge for subscription', {
            subscriptionId: subscription.id,
            error,
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Charge scheduler completed', {
        duration: `${duration}ms`,
        total: subscriptions.length,
        success: successCount,
        errors: errorCount,
      });
    } catch (error) {
      logger.error('Charge scheduler failed', { error });
    }
  }

  /**
   * Create charge for a specific subscription
   */
  private async createChargeForSubscription(subscription: any): Promise<void> {
    const { agreement, nextBillingDate } = subscription;

    logger.info('Creating charge for subscription', {
      subscriptionId: subscription.id,
      agreementId: agreement.id,
      dueDate: nextBillingDate,
    });

    // Check if charge already exists for this due date
    const existingCharge = await prisma.charge.findFirst({
      where: {
        agreementId: agreement.id,
        dueDate: nextBillingDate,
      },
    });

    if (existingCharge) {
      logger.warn('Charge already exists for this due date', {
        chargeId: existingCharge.id,
        agreementId: agreement.id,
        dueDate: nextBillingDate,
      });
      return;
    }

    // Create description with month/year
    const dueDate = new Date(nextBillingDate);
    const monthNames = [
      'Januar',
      'Februar',
      'Marts',
      'April',
      'Maj',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'December',
    ];
    const description = `${agreement.productName} - ${monthNames[dueDate.getMonth()]} ${dueDate.getFullYear()}`;

    // Create charge via MobilePay API
    const charge = await chargeService.createCharge(
      agreement,
      agreement.amount,
      dueDate,
      description,
      5 // retry days
    );

    logger.info('Charge created successfully', {
      chargeId: charge.id,
      mobilepayChargeId: charge.mobilepayChargeId,
    });

    // Calculate next billing date
    const nextBillingDateNew = chargeService.calculateNextBillingDate(
      dueDate,
      agreement.intervalUnit,
      agreement.intervalCount
    );

    // Update subscription with new next billing date
    await prisma.subscriptionSync.update({
      where: { id: subscription.id },
      data: { nextBillingDate: nextBillingDateNew },
    });

    logger.info('Next billing date updated', {
      subscriptionId: subscription.id,
      oldDate: nextBillingDate,
      newDate: nextBillingDateNew,
    });

    // Queue charge for monitoring (optional)
    await chargeQueue.add(
      'monitor-charge',
      {
        chargeId: charge.id,
        dueDate: dueDate.toISOString(),
      },
      {
        delay: this.calculateDelayUntilDueDate(dueDate),
      }
    );
  }

  /**
   * Calculate delay in milliseconds until due date
   */
  private calculateDelayUntilDueDate(dueDate: Date): number {
    const now = Date.now();
    const due = dueDate.getTime();
    return Math.max(0, due - now);
  }

  /**
   * Manual trigger for testing
   */
  async triggerManually(): Promise<void> {
    logger.info('Manual charge scheduler trigger');
    await this.scheduleUpcomingCharges();
  }
}

export default new ChargeSchedulerService();
