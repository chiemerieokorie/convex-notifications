import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const createNotification = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    required: v.optional(v.boolean()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      tenantId: args.tenantId,
      userId: args.userId,
      event: args.event,
      title: args.title,
      body: args.body,
      data: args.data,
      required: args.required,
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
 * Atomically check and record a deduplication key in a single mutation.
 * Prevents TOCTOU race conditions.
 *
 * Returns true if the key was already present (duplicate), false if newly recorded.
 */
export const checkAndRecordDeduplication = internalMutation({
  args: {
    key: v.string(),
    ttlSeconds: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("deduplication")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (entry && entry.expiresAt > Date.now()) {
      return true; // Duplicate
    }
    await ctx.db.insert("deduplication", {
      key: args.key,
      expiresAt: Date.now() + args.ttlSeconds * 1000,
    });
    return false; // Not a duplicate
  },
});

/**
 * Clean up expired deduplication keys (cron).
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

    const expired = await ctx.db
      .query("deduplication")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(batchSize + 1);

    const hasMore = expired.length > batchSize;
    const toDelete = expired.slice(0, batchSize);

    for (const entry of toDelete) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: toDelete.length, hasMore };
  },
});

/**
 * Process pending scheduled notifications (cron).
 *
 * Creates inbox records only. Full channel dispatch must be handled
 * by the client since the component doesn't have access to channel clients.
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

    const pending = await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_status_scheduledFor", (q) =>
        q.eq("status", "pending").lte("scheduledFor", now),
      )
      .take(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const scheduled of pending) {
      await ctx.db.patch(scheduled._id, { status: "processing" });

      try {
        // Check deduplication
        const dedupeKey = scheduled.deduplicationKey;
        if (dedupeKey) {
          const entry = await ctx.db
            .query("deduplication")
            .withIndex("by_key", (q) => q.eq("key", dedupeKey))
            .first();
          if (entry && entry.expiresAt > Date.now()) {
            await ctx.db.patch(scheduled._id, {
              status: "failed",
              reason: "Duplicate notification suppressed",
              processedAt: Date.now(),
            });
            failed++;
            continue;
          }
        }

        // Create inbox record — title/body are rendered at schedule time
        // by the client and stored in data, or re-rendered by the client
        // when processing. For now we use the event name as a placeholder.
        await ctx.db.insert("notifications", {
          tenantId: scheduled.tenantId,
          userId: scheduled.userId,
          event: scheduled.event,
          title: scheduled.event, // Client re-renders on dispatch
          body: "",
          data: scheduled.data,
          required: scheduled.required,
        });

        // Record deduplication key
        if (dedupeKey) {
          await ctx.db.insert("deduplication", {
            key: dedupeKey,
            expiresAt: Date.now() + 86400 * 1000,
          });
        }

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
          reason: errorMessage,
          processedAt: Date.now(),
        });

        failed++;
      }
    }

    return { processed: pending.length, succeeded, failed };
  },
});

/**
 * Process pending retries (cron).
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

    const pending = await ctx.db
      .query("retryQueue")
      .withIndex("by_status_nextRetryAt", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", now),
      )
      .take(batchSize);

    const readyForRetry: (typeof pending)[0]["_id"][] = [];

    for (const retry of pending) {
      await ctx.db.patch(retry._id, { status: "processing" });
      readyForRetry.push(retry._id);
    }

    return { processed: pending.length, readyForRetry };
  },
});
