import Queue from 'bull';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create charge processing queue
export const chargeQueue = new Queue('charge-processing', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Handle queue events
chargeQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

chargeQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err);
});

chargeQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

export default chargeQueue;
