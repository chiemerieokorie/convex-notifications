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

    const all = await q.order("desc").collect();

    // Filter: exclude archived, apply cursor
    const filtered = all.filter((n) => {
      if (n.archivedAt !== undefined) return false;
      if (args.cursor !== undefined && n._creationTime >= args.cursor)
        return false;
      return true;
    });

    const page = filtered.slice(0, limit);
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
    const results = await q.collect();
    return results.filter((n) => n.archivedAt === undefined).length;
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
