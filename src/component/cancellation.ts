import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const storeCancellationKey = internalMutation({
  args: {
    key: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.id("cancellationKeys"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("cancellationKeys", {
      key: args.key,
      notificationId: args.notificationId,
    });
  },
});

export const cancelByKey = internalMutation({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cancellationKeys")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!entry) return false;

    // Archive the notification
    const notification = await ctx.db.get(entry.notificationId);
    if (notification && notification.archivedAt === undefined) {
      await ctx.db.patch(entry.notificationId, { archivedAt: Date.now() });
    }

    // Remove the cancellation key
    await ctx.db.delete(entry._id);
    return true;
  },
});

export const checkCancelled = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return true;
    return notification.archivedAt !== undefined;
  },
});
