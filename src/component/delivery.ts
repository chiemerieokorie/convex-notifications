import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { deliveryLogValidator } from "./validators.js";

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("failed"),
);

export const createDeliveryLog = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    notificationId: v.id("notifications"),
    channel: v.string(),
    status: statusValidator,
    metadata: v.optional(v.any()),
    externalId: v.optional(v.string()),
  },
  returns: v.id("deliveryLog"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("deliveryLog", {
      tenantId: args.tenantId,
      notificationId: args.notificationId,
      channel: args.channel,
      status: args.status,
      metadata: args.metadata,
      externalId: args.externalId,
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
  returns: v.array(deliveryLogValidator),
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
    // Find delivery log by externalId using the index (O(1) lookup)
    const log = await ctx.db
      .query("deliveryLog")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();

    if (!log) {
      // No delivery log found - this can happen if the webhook arrives
      // before the delivery log is created or for unknown external IDs
      return false;
    }

    // Verify the channel matches
    if (log.channel !== args.channel) {
      return false;
    }

    // Only set sentAt if transitioning to sent/delivered and not already set
    const shouldSetSentAt =
      (args.status === "sent" || args.status === "delivered") && !log.sentAt;

    // Update the delivery log
    const existingMetadata =
      log.metadata != null && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};
    await ctx.db.patch(log._id, {
      status: args.status,
      error: args.error,
      ...(shouldSetSentAt ? { sentAt: Date.now() } : {}),
      metadata: {
        ...existingMetadata,
        webhookData: args.webhookData,
        webhookReceivedAt: Date.now(),
      },
    });

    return true;
  },
});
