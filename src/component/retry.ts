/**
 * Retry queue handling for failed deliveries.
 *
 * This module provides:
 * - Functions to queue failed deliveries for retry
 * - Exponential backoff calculation
 * - Cron handler to process retry queue
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { retryQueueValidator } from "./validators.js";

/**
 * Default retry configuration
 */
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 60_000; // 1 minute
const DEFAULT_MAX_DELAY_MS = 3600_000; // 1 hour
const BACKOFF_MULTIPLIER = 2;

/**
 * Calculate next retry delay using exponential backoff.
 * Note: No jitter is added to keep mutations deterministic.
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number = DEFAULT_INITIAL_DELAY_MS,
  maxDelayMs: number = DEFAULT_MAX_DELAY_MS,
): number {
  const delay = initialDelayMs * Math.pow(BACKOFF_MULTIPLIER, attempt - 1);
  return Math.min(delay, maxDelayMs);
}

/**
 * Queue a failed delivery for retry.
 */
export const queueRetry = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    deliveryLogId: v.id("deliveryLog"),
    channel: v.string(),
    rendered: v.any(),
    error: v.string(),
    maxAttempts: v.optional(v.number()),
    initialDelayMs: v.optional(v.number()),
  },
  returns: v.union(v.id("retryQueue"), v.null()),
  handler: async (ctx, args) => {
    const maxAttempts = args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const initialDelay = args.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

    // Check if already queued using compound index
    const existing = await ctx.db
      .query("retryQueue")
      .withIndex("by_notificationId_channel", (q) =>
        q.eq("notificationId", args.notificationId).eq("channel", args.channel),
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "processing"),
        ),
      )
      .first();

    if (existing) {
      // Already queued for retry
      return null;
    }

    const nextRetryAt = Date.now() + calculateBackoffDelay(1, initialDelay);

    return await ctx.db.insert("retryQueue", {
      notificationId: args.notificationId,
      deliveryLogId: args.deliveryLogId,
      channel: args.channel,
      attempt: 1,
      maxAttempts,
      nextRetryAt,
      status: "pending",
      lastError: args.error,
      rendered: args.rendered,
    });
  },
});

/**
 * Get pending retries that are ready to process.
 */
export const getPendingRetries = internalQuery({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.array(retryQueueValidator),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const now = Date.now();

    return await ctx.db
      .query("retryQueue")
      .withIndex("by_status_nextRetryAt", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", now),
      )
      .take(batchSize);
  },
});

/**
 * Mark a retry as processing.
 */
export const markRetryProcessing = internalMutation({
  args: {
    id: v.id("retryQueue"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const retry = await ctx.db.get(args.id);
    if (!retry || retry.status !== "pending") {
      return false;
    }

    await ctx.db.patch(args.id, {
      status: "processing",
    });
    return true;
  },
});

/**
 * Mark a retry as succeeded.
 */
export const markRetrySucceeded = internalMutation({
  args: {
    id: v.id("retryQueue"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "succeeded",
    });
    return null;
  },
});

/**
 * Mark a retry as failed and potentially schedule another attempt.
 */
export const markRetryFailed = internalMutation({
  args: {
    id: v.id("retryQueue"),
    error: v.string(),
  },
  returns: v.object({
    willRetry: v.boolean(),
    nextAttempt: v.optional(v.number()),
    exhausted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const retry = await ctx.db.get(args.id);
    if (!retry) {
      return { willRetry: false, exhausted: true };
    }

    const nextAttempt = retry.attempt + 1;

    if (nextAttempt > retry.maxAttempts) {
      // Max attempts reached
      await ctx.db.patch(args.id, {
        status: "exhausted",
        lastError: args.error,
      });
      return { willRetry: false, exhausted: true };
    }

    // Schedule next retry
    const nextRetryAt = Date.now() + calculateBackoffDelay(nextAttempt);

    await ctx.db.patch(args.id, {
      status: "pending",
      attempt: nextAttempt,
      nextRetryAt,
      lastError: args.error,
    });

    return {
      willRetry: true,
      nextAttempt,
      exhausted: false,
    };
  },
});

/**
 * Get retry statistics for a notification.
 */
export const getRetryStats = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.array(retryQueueValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("retryQueue")
      .withIndex("by_notificationId", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
  },
});
