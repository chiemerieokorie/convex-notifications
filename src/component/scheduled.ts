/**
 * Scheduled notifications handling.
 *
 * Stores event + data only — no rendered templates. When the schedule fires,
 * the full send() pipeline runs from scratch so templates are always fresh.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { scheduledNotificationValidator } from "./validators.js";

/**
 * Schedule a notification for future delivery.
 */
export const scheduleNotification = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    event: v.string(),
    category: v.optional(v.string()),
    data: v.optional(v.any()),
    scheduledFor: v.number(),
    required: v.optional(v.boolean()),
    deduplicationKey: v.optional(v.string()),
  },
  returns: v.id("scheduledNotifications"),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.scheduledFor <= now) {
      throw new Error("scheduledFor must be in the future");
    }

    return await ctx.db.insert("scheduledNotifications", {
      tenantId: args.tenantId,
      userId: args.userId,
      event: args.event,
      category: args.category,
      data: args.data,
      scheduledFor: args.scheduledFor,
      required: args.required,
      deduplicationKey: args.deduplicationKey,
      status: "pending",
    });
  },
});

/**
 * Get pending scheduled notifications that are ready to be sent.
 */
export const getPendingScheduledNotifications = internalQuery({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.array(scheduledNotificationValidator),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const now = Date.now();

    return await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_status_scheduledFor", (q) =>
        q.eq("status", "pending").lte("scheduledFor", now),
      )
      .take(batchSize);
  },
});

/**
 * Mark a scheduled notification as processing.
 */
export const markScheduledProcessing = internalMutation({
  args: {
    id: v.id("scheduledNotifications"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.status !== "pending") {
      return false;
    }

    await ctx.db.patch(args.id, { status: "processing" });
    return true;
  },
});

/**
 * Mark a scheduled notification as sent.
 */
export const markScheduledSent = internalMutation({
  args: {
    id: v.id("scheduledNotifications"),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "sent",
      processedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Mark a scheduled notification as failed.
 */
export const markScheduledFailed = internalMutation({
  args: {
    id: v.id("scheduledNotifications"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      reason: args.reason,
      processedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Cancel a scheduled notification.
 */
export const cancelScheduledNotification = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    id: v.id("scheduledNotifications"),
    userId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);

    if (!notification || notification.userId !== args.userId) {
      return false;
    }
    if (args.tenantId !== undefined && notification.tenantId !== args.tenantId) {
      return false;
    }
    if (notification.status !== "pending") {
      return false;
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      processedAt: Date.now(),
    });
    return true;
  },
});

/**
 * Get scheduled notifications for a user.
 */
export const getScheduledNotifications = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
  },
  returns: v.array(scheduledNotificationValidator),
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("scheduledNotifications")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", args.userId).eq("status", args.status!),
        )
        .collect();
    }

    return await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
