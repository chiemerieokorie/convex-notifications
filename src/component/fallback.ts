/**
 * Channel fallback handling.
 *
 * This module provides functionality for falling back to alternative channels
 * when a notification remains unread on the primary channel.
 *
 * Common use case: Send push notification first, then fall back to email
 * if the user hasn't read it within N minutes.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

/**
 * Queue a notification for channel fallback.
 *
 * @example
 * ```ts
 * // After sending a push notification, queue email fallback for 30 minutes
 * await ctx.runMutation(internal.fallback.queueFallback, {
 *   notificationId,
 *   userId: "user123",
 *   fromChannel: "push",
 *   toChannel: "email",
 *   delayMs: 30 * 60 * 1000, // 30 minutes
 * });
 * ```
 */
export const queueFallback = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    userId: v.string(),
    fromChannel: v.string(),
    toChannel: v.string(),
    delayMs: v.number(),
  },
  returns: v.id("fallbackQueue"),
  handler: async (ctx, args) => {
    const fallbackAt = Date.now() + args.delayMs;

    return await ctx.db.insert("fallbackQueue", {
      notificationId: args.notificationId,
      userId: args.userId,
      fromChannel: args.fromChannel,
      toChannel: args.toChannel,
      fallbackAt,
      status: "pending",
    });
  },
});

/**
 * Cancel pending fallbacks for a notification.
 * Called when a user reads the notification.
 */
export const cancelFallback = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("fallbackQueue")
      .withIndex("by_notificationId", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    let cancelled = 0;
    for (const fallback of pending) {
      await ctx.db.patch(fallback._id, { status: "cancelled" });
      cancelled++;
    }

    return cancelled;
  },
});

/**
 * Get pending fallbacks that are ready to be processed.
 */
export const getPendingFallbacks = internalQuery({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const now = Date.now();

    return await ctx.db
      .query("fallbackQueue")
      .withIndex("by_status_fallbackAt", (q) =>
        q.eq("status", "pending").lte("fallbackAt", now),
      )
      .take(batchSize);
  },
});

/**
 * Process pending fallbacks.
 * Called by cron every minute.
 *
 * This function checks if the notification has been read. If not,
 * it triggers the fallback channel. The actual dispatch is handled
 * by the consumer app since it requires access to the Notifications client.
 */
export const processFallbacks = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    triggered: v.number(),
    cancelled: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const now = Date.now();

    const pending = await ctx.db
      .query("fallbackQueue")
      .withIndex("by_status_fallbackAt", (q) =>
        q.eq("status", "pending").lte("fallbackAt", now),
      )
      .take(batchSize);

    let triggered = 0;
    let cancelled = 0;

    for (const fallback of pending) {
      // Check if notification has been read
      const notification = await ctx.db.get(fallback.notificationId);

      if (!notification) {
        // Notification was deleted, cancel fallback
        await ctx.db.patch(fallback._id, { status: "cancelled" });
        cancelled++;
        continue;
      }

      if (notification.readAt) {
        // Already read, no need to fallback
        await ctx.db.patch(fallback._id, { status: "cancelled" });
        cancelled++;
        continue;
      }

      // Mark as triggered - actual dispatch happens via callback or scheduled action
      await ctx.db.patch(fallback._id, {
        status: "triggered",
        triggeredAt: now,
      });
      triggered++;
    }

    return {
      processed: pending.length,
      triggered,
      cancelled,
    };
  },
});

/**
 * Get fallback status for a notification.
 */
export const getFallbackStatus = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fallbackQueue")
      .withIndex("by_notificationId", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
  },
});

/**
 * Get triggered fallbacks that need to be dispatched.
 * Consumer apps should poll this to send fallback notifications.
 */
export const getTriggeredFallbacks = internalQuery({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("fallbackQueue"),
      notificationId: v.id("notifications"),
      userId: v.string(),
      fromChannel: v.string(),
      toChannel: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;

    const triggered = await ctx.db
      .query("fallbackQueue")
      .filter((q) => q.eq(q.field("status"), "triggered"))
      .take(batchSize);

    return triggered.map((f) => ({
      _id: f._id,
      notificationId: f.notificationId,
      userId: f.userId,
      fromChannel: f.fromChannel,
      toChannel: f.toChannel,
    }));
  },
});
