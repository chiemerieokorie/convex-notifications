import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("failed"),
);

export const createDeliveryLog = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    channel: v.string(),
    status: statusValidator,
    metadata: v.optional(v.any()),
  },
  returns: v.id("deliveryLog"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("deliveryLog", {
      notificationId: args.notificationId,
      channel: args.channel,
      status: args.status,
      metadata: args.metadata,
    });
  },
});

export const updateDeliveryStatus = internalMutation({
  args: {
    deliveryLogId: v.id("deliveryLog"),
    status: statusValidator,
    error: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryLogId, {
      status: args.status,
      error: args.error,
      sentAt: args.sentAt,
    });
    return null;
  },
});

export const getDeliveryLogs = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryLog")
      .withIndex("by_notificationId", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
  },
});
