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

/**
 * Update delivery log from webhook callback.
 * Used by Resend and Twilio webhooks to update delivery status.
 */
export const updateDeliveryFromWebhook = internalMutation({
  args: {
    externalId: v.string(),
    channel: v.string(),
    status: statusValidator,
    error: v.optional(v.string()),
    webhookData: v.optional(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Find delivery log by externalId in metadata
    const logs = await ctx.db
      .query("deliveryLog")
      .withIndex("by_status")
      .filter((q) => q.eq(q.field("channel"), args.channel))
      .collect();

    // Find the log with matching externalId
    const log = logs.find((l) => {
      const metadata = l.metadata as { externalId?: string } | undefined;
      return metadata?.externalId === args.externalId;
    });

    if (!log) {
      console.log(
        `[webhook] No delivery log found for externalId: ${args.externalId}`,
      );
      return false;
    }

    // Update the delivery log
    await ctx.db.patch(log._id, {
      status: args.status,
      error: args.error,
      sentAt: args.status === "sent" || args.status === "delivered" ? Date.now() : undefined,
      metadata: {
        ...(log.metadata as object),
        webhookData: args.webhookData,
        webhookReceivedAt: Date.now(),
      },
    });

    return true;
  },
});
