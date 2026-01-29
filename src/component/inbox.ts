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
    const q = ctx.db
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
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("notifications")
      .withIndex("by_userId_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .collect();
    return results.filter((n) => n.archivedAt === undefined).length;
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
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .collect();
    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });
    }
    return null;
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
