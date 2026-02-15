/**
 * Scheduled notifications handling.
 *
 * This module provides:
 * - Functions to schedule notifications for future delivery
 * - Cron handler to process scheduled notifications
 * - Functions to cancel or modify scheduled notifications
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
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    channels: v.any(),
    scheduledFor: v.number(),
    transactional: v.optional(v.boolean()),
    deduplicationKey: v.optional(v.string()),
  },
  returns: v.id("scheduledNotifications"),
  handler: async (ctx, args) => {
    // Validate scheduledFor is in the future
    const now = Date.now();
    if (args.scheduledFor <= now) {
      throw new Error("scheduledFor must be in the future");
    }

    return await ctx.db.insert("scheduledNotifications", {
      tenantId: args.tenantId,
      userId: args.userId,
      event: args.event,
      category: args.category,
      title: args.title,
      body: args.body,
      data: args.data,
      channels: args.channels,
      scheduledFor: args.scheduledFor,
      transactional: args.transactional,
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

    await ctx.db.patch(args.id, {
      status: "processing",
    });
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
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
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
    userId: v.string(), // For permission check
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);

    // Permission check
    if (!notification || notification.userId !== args.userId) {
      return false;
    }
    // Cross-check tenantId for multi-tenant isolation
    if (args.tenantId !== undefined && notification.tenantId !== args.tenantId) {
      return false;
    }

    // Can only cancel pending notifications
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
