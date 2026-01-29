import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const list = internalQuery({
  args: {
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

    let q;
    if (args.cursor !== undefined) {
      q = ctx.db
        .query("notifications")
        .withIndex("by_userId_active", (idx) =>
          idx
            .eq("userId", args.userId)
            .eq("archivedAt", undefined)
            .lt("_creationTime", args.cursor!),
        );
    } else {
      q = ctx.db
        .query("notifications")
        .withIndex("by_userId_active", (idx) =>
          idx.eq("userId", args.userId).eq("archivedAt", undefined),
        );
    }

    const results = await q.order("desc").take(limit + 1);
    const page = results.slice(0, limit);
    const nextCursor =
      results.length > limit ? page[page.length - 1]._creationTime : null;

    return { notifications: page, cursor: nextCursor };
  },
});

export const unreadCount = internalQuery({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("notifications")
      .withIndex("by_userId_active", (idx) =>
        idx.eq("userId", args.userId).eq("archivedAt", undefined),
      )
      .collect();
    return results.filter((n) => n.readAt === undefined).length;
  },
});

export const markRead = internalMutation({
  args: {
    userId: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== args.userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    return null;
  },
});

export const markAllRead = internalMutation({
  args: {
    userId: v.string(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    marked: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.batchSize ?? 500;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .take(limit + 1);
    const now = Date.now();
    const batch = unread.slice(0, limit);
    for (const n of batch) {
      if (n.archivedAt === undefined) {
        await ctx.db.patch(n._id, { readAt: now });
      }
    }
    return { marked: batch.length, hasMore: unread.length > limit };
  },
});

export const archive = internalMutation({
  args: {
    userId: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== args.userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.notificationId, { archivedAt: Date.now() });
    return null;
  },
});
