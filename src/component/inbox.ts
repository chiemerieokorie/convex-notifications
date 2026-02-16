import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { internalMutation, internalQuery } from "./_generated/server.js";
import schema from "./schema.js";

export const list = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("notifications"),
        _creationTime: v.number(),
        tenantId: v.optional(v.string()),
        userId: v.string(),
        event: v.string(),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
        readAt: v.optional(v.number()),
        archivedAt: v.optional(v.number()),
        transactional: v.optional(v.boolean()),
      }),
    ),
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
