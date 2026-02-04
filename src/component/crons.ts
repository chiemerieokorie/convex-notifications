import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

/**
 * Clean up expired deduplication keys every hour.
 * This prevents the deduplication table from growing indefinitely.
 */
crons.interval(
  "cleanup expired deduplication keys",
  { hours: 1 },
  internal.notifications.cleanupExpiredDeduplication,
  { batchSize: 500 },
);

/**
 * Process scheduled notifications every minute.
 * This dispatches notifications that are scheduled for the current time.
 */
crons.interval(
  "process scheduled notifications",
  { minutes: 1 },
  internal.processor.processScheduledNotifications,
  { batchSize: 50 },
);

/**
 * Process retry queue every minute.
 * This handles retrying failed channel deliveries with exponential backoff.
 */
crons.interval(
  "process retry queue",
  { minutes: 1 },
  internal.processor.processRetryQueue,
  { batchSize: 50 },
);

export default crons;
