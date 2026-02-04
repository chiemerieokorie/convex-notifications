import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const createNotification = internalMutation({
  args: {
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    transactional: v.optional(v.boolean()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      event: args.event,
      title: args.title,
      body: args.body,
      data: args.data,
      transactional: args.transactional,
    });
  },
});

export const checkDeduplication = internalQuery({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("deduplication")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!entry) return false;
    return entry.expiresAt > Date.now();
  },
});

export const recordDeduplication = internalMutation({
  args: {
    key: v.string(),
    ttlSeconds: v.number(),
  },
  returns: v.id("deduplication"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("deduplication", {
      key: args.key,
      expiresAt: Date.now() + args.ttlSeconds * 1000,
    });
  },
});

/**
 * Clean up expired deduplication keys.
 * This is called by a cron job to prevent the table from growing indefinitely.
 */
export const cleanupExpiredDeduplication = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();

    // Query expired entries using the expiresAt index
    const expired = await ctx.db
      .query("deduplication")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(batchSize + 1);

    const hasMore = expired.length > batchSize;
    const toDelete = expired.slice(0, batchSize);

    // Delete in batch
    for (const entry of toDelete) {
      await ctx.db.delete(entry._id);
    }

    return {
      deleted: toDelete.length,
      hasMore,
    };
  },
});

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
        const dedupeKey = scheduled.deduplicationKey;
        if (dedupeKey) {
          const entry = await ctx.db
            .query("deduplication")
            .withIndex("by_key", (q) => q.eq("key", dedupeKey))
            .first();
          if (entry && entry.expiresAt > Date.now()) {
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
        const notificationId = await ctx.db.insert("notifications", {
          userId: scheduled.userId,
          event: scheduled.event,
          title: scheduled.title,
          body: scheduled.body,
          data: scheduled.data,
          transactional: scheduled.transactional,
        });

        // Record deduplication key
        if (dedupeKey) {
          await ctx.db.insert("deduplication", {
            key: dedupeKey,
            expiresAt: Date.now() + 86400 * 1000, // 24 hours
          });
        }

        // Mark as sent
        await ctx.db.patch(scheduled._id, {
          status: "sent",
          processedAt: Date.now(),
        });

        succeeded++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await ctx.db.patch(scheduled._id, {
          status: "failed",
          error: errorMessage,
          processedAt: Date.now(),
        });

        failed++;
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

    const readyForRetry: (typeof pending)[0]["_id"][] = [];

    for (const retry of pending) {
      // Mark as processing
      await ctx.db.patch(retry._id, { status: "processing" });
      readyForRetry.push(retry._id);
    }

    return {
      processed: pending.length,
      readyForRetry,
    };
  },
});
