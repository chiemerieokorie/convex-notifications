/**
 * Notification processors for cron jobs.
 *
 * These internal mutations are called by cron jobs to process:
 * - Scheduled notifications
 * - Retry queue
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

/**
 * Process pending scheduled notifications.
 * Called by cron every minute.
 */
export const processScheduledNotifications = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const now = Date.now();

    // Get pending scheduled notifications
    const pending = await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_status_scheduledFor", (q) =>
        q.eq("status", "pending").lte("scheduledFor", now),
      )
      .take(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const scheduled of pending) {
      // Mark as processing
      await ctx.db.patch(scheduled._id, { status: "processing" });

      try {
        // Check deduplication if key provided
        if (scheduled.deduplicationKey) {
          const isDuplicate = await ctx.runQuery(
            internal.notifications.checkDeduplication,
            { key: scheduled.deduplicationKey },
          );
          if (isDuplicate) {
            await ctx.db.patch(scheduled._id, {
              status: "failed",
              error: "Duplicate notification suppressed",
              processedAt: Date.now(),
            });
            failed++;
            continue;
          }
        }

        // Create the notification in inbox
        const notificationId = await ctx.runMutation(
          internal.notifications.createNotification,
          {
            userId: scheduled.userId,
            event: scheduled.event,
            title: scheduled.title,
            body: scheduled.body,
            data: scheduled.data,
            transactional: scheduled.transactional,
          },
        );

        // Record deduplication key
        if (scheduled.deduplicationKey) {
          await ctx.runMutation(internal.notifications.recordDeduplication, {
            key: scheduled.deduplicationKey,
            ttlSeconds: 86400, // 24 hours
          });
        }

        // Mark as sent
        await ctx.db.patch(scheduled._id, {
          status: "sent",
          processedAt: Date.now(),
        });

        succeeded++;

        // Note: Channel dispatch would need to be handled separately
        // as we don't have access to the Notifications class context here.
        // The consumer app should set up a separate action for channel dispatch.
        console.log(
          `[scheduled] Notification ${notificationId} created for scheduled ${scheduled._id}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await ctx.db.patch(scheduled._id, {
          status: "failed",
          error: errorMessage,
          processedAt: Date.now(),
        });

        failed++;
        console.error(
          `[scheduled] Failed to process ${scheduled._id}:`,
          error,
        );
      }
    }

    return {
      processed: pending.length,
      succeeded,
      failed,
    };
  },
});

/**
 * Process pending retries.
 * Called by cron every minute.
 *
 * Note: Actual retry dispatch needs to be handled by the consumer app
 * as we don't have access to the child component clients here.
 * This just manages the retry queue status.
 */
export const processRetryQueue = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    readyForRetry: v.array(v.id("retryQueue")),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const now = Date.now();

    // Get pending retries that are ready
    const pending = await ctx.db
      .query("retryQueue")
      .withIndex("by_status_nextRetryAt", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", now),
      )
      .take(batchSize);

    const readyForRetry: string[] = [];

    for (const retry of pending) {
      // Mark as processing
      await ctx.db.patch(retry._id, { status: "processing" });
      readyForRetry.push(retry._id);

      console.log(
        `[retry] Retry ${retry._id} ready for attempt ${retry.attempt}/${retry.maxAttempts}`,
      );
    }

    return {
      processed: pending.length,
      readyForRetry: readyForRetry as any, // ID array
    };
  },
});
