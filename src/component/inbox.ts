import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const list = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    notifications: v.array(v.any()),
    cursor: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("notifications")
          .withIndex("by_tenantId_userId", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId),
          )
      : ctx.db
          .query("notifications")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId));

    // Stream through results, filtering as we go instead of collecting all
    const page = [];
    for await (const n of q.order("desc")) {
      if (n.archivedAt !== undefined) continue;
      if (args.cursor !== undefined && n._creationTime >= args.cursor) continue;
      page.push(n);
      if (page.length === limit) break;
    }

    const nextCursor =
      page.length === limit ? page[page.length - 1]._creationTime : null;

    return { notifications: page, cursor: nextCursor };
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
    // Count in-place instead of collecting all documents into memory
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
    // Cross-check tenantId for multi-tenant isolation
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

export const markAllRead = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
  },
  returns: v.null(),
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
    const unread = await q.collect();
    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });

      // Cancel any pending fallbacks for this notification
      const pendingFallbacks = await ctx.db
        .query("fallbackQueue")
        .withIndex("by_notificationId", (q) => q.eq("notificationId", n._id))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();

      for (const fallback of pendingFallbacks) {
        await ctx.db.patch(fallback._id, { status: "cancelled" });
      }
    }
    return null;
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
    // Cross-check tenantId for multi-tenant isolation
    if (args.tenantId !== undefined && notification.tenantId !== args.tenantId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.notificationId, { archivedAt: Date.now() });
    return null;
  },
});
