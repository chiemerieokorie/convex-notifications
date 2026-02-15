import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { notificationValidator } from "./validators.js";
import schema from "./schema.js";

export const list = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(notificationValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const p = paginator(ctx.db, schema);
    const q = args.tenantId !== undefined
      ? p
          .query("notifications")
          .withIndex("by_tenantId_userId", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId),
          )
      : p
          .query("notifications")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId));

    const result = await q
      .order("desc")
      .filterWith(async (n) => n.archivedAt === undefined)
      .paginate(args.paginationOpts);

    return result;
  },
});

export const unreadCount = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("notifications")
          .withIndex("by_tenantId_userId_unread", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId).eq("readAt", undefined),
          )
      : ctx.db
          .query("notifications")
          .withIndex("by_userId_unread", (q) =>
            q.eq("userId", args.userId).eq("readAt", undefined),
          );
    let count = 0;
    for await (const n of q) {
      if (n.archivedAt === undefined) count++;
    }
    return count;
  },
});

export const markRead = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== args.userId) {
      throw new Error("Notification not found");
    }
    if (args.tenantId !== undefined && notification.tenantId !== args.tenantId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });

    // Cancel any pending fallbacks for this notification
    const pendingFallbacks = await ctx.db
      .query("fallbackQueue")
      .withIndex("by_notificationId", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const fallback of pendingFallbacks) {
      await ctx.db.patch(fallback._id, { status: "cancelled" });
    }

    return null;
  },
});

/**
 * Mark all notifications as read for a user.
 *
 * Processes up to `batchSize` (default 100) notifications per call.
 * If more remain, the caller should schedule a continuation.
 */
export const markAllRead = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    marked: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("notifications")
          .withIndex("by_tenantId_userId_unread", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId).eq("readAt", undefined),
          )
      : ctx.db
          .query("notifications")
          .withIndex("by_userId_unread", (q) =>
            q.eq("userId", args.userId).eq("readAt", undefined),
          );
    const unread = await q.take(batchSize + 1);
    const hasMore = unread.length > batchSize;
    const toMark = unread.slice(0, batchSize);
    const now = Date.now();

    for (const n of toMark) {
      await ctx.db.patch(n._id, { readAt: now });

      // Cancel pending fallbacks
      const pendingFallbacks = await ctx.db
        .query("fallbackQueue")
        .withIndex("by_notificationId", (q) => q.eq("notificationId", n._id))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();

      for (const fallback of pendingFallbacks) {
        await ctx.db.patch(fallback._id, { status: "cancelled" });
      }
    }

    return { marked: toMark.length, hasMore };
  },
});

export const archive = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== args.userId) {
      throw new Error("Notification not found");
    }
    if (args.tenantId !== undefined && notification.tenantId !== args.tenantId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.notificationId, { archivedAt: Date.now() });
    return null;
  },
});
