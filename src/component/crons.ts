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
  internal.notifications.processScheduledNotifications,
  { batchSize: 200 },
);

/**
 * Process retry queue every minute.
 * This handles retrying failed channel deliveries with exponential backoff.
 */
crons.interval(
  "process retry queue",
  { minutes: 1 },
  internal.notifications.processRetryQueue,
  { batchSize: 200 },
);

/**
 * Process channel fallbacks every minute.
 * This handles falling back to alternative channels (e.g., push → email)
 * when notifications remain unread.
 */
crons.interval(
  "process channel fallbacks",
  { minutes: 1 },
  internal.fallback.processFallbacks,
  { batchSize: 200 },
);

/**
 * Clean up completed retry queue entries every 6 hours.
 * Removes "succeeded" and "exhausted" entries older than 7 days.
 */
crons.interval(
  "cleanup completed retries",
  { hours: 6 },
  internal.notifications.cleanupRetryQueue,
  { batchSize: 500 },
);

/**
 * Clean up completed fallback queue entries every 6 hours.
 * Removes "cancelled" and "triggered" entries older than 7 days.
 */
crons.interval(
  "cleanup completed fallbacks",
  { hours: 6 },
  internal.fallback.cleanupFallbackQueue,
  { batchSize: 500 },
);

export default crons;
