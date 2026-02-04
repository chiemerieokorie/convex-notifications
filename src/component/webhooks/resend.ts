/**
 * Resend webhook handler for email delivery status updates.
 *
 * Resend sends webhooks for various email events:
 * - email.sent: Email was sent to the recipient
 * - email.delivered: Email was delivered to the recipient's inbox
 * - email.bounced: Email bounced (permanent failure)
 * - email.complained: Recipient marked email as spam
 * - email.opened: Recipient opened the email (if tracking enabled)
 * - email.clicked: Recipient clicked a link (if tracking enabled)
 *
 * @see https://resend.com/docs/webhooks
 */

import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server.js";
import { internal } from "../_generated/api.js";

/**
 * Resend webhook event types that affect delivery status
 */
type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.delivery_delayed"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

/**
 * Resend webhook payload structure
 */
type ResendWebhookPayload = {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Additional fields may be present depending on event type
  };
};

/**
 * Map Resend event types to our delivery status
 */
function mapResendEventToStatus(
  eventType: ResendEventType,
): "sent" | "delivered" | "failed" | null {
  switch (eventType) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.bounced":
    case "email.complained":
      return "failed";
    case "email.delivery_delayed":
    case "email.opened":
    case "email.clicked":
      // These don't change our delivery status
      return null;
    default:
      return null;
  }
}

/**
 * HTTP action to receive Resend webhooks.
 *
 * To use this webhook:
 * 1. Deploy your Convex app
 * 2. Configure the webhook URL in Resend dashboard:
 *    https://<your-deployment>.convex.site/webhooks/resend
 * 3. Select the events you want to receive
 *
 * @example
 * ```ts
 * // In your convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { resendWebhook } from "convex-notifications";
 *
 * const http = httpRouter();
 * http.route({
 *   path: "/webhooks/resend",
 *   method: "POST",
 *   handler: resendWebhook,
 * });
 * export default http;
 * ```
 */
export const resendWebhook = httpAction(async (ctx, request) => {
  // Parse the webhook payload
  let payload: ResendWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  // Validate required fields
  if (!payload.type || !payload.data?.email_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Map event type to our status
  const status = mapResendEventToStatus(payload.type);
  if (!status) {
    // Event doesn't affect delivery status, acknowledge it
    return new Response("OK", { status: 200 });
  }

  // Update delivery log
  await ctx.runMutation(internal.webhooks.resend.updateDeliveryFromWebhook, {
    externalId: payload.data.email_id,
    channel: "email",
    status,
    eventType: payload.type,
    eventData: payload.data,
  });

  return new Response("OK", { status: 200 });
});

/**
 * Internal mutation to update delivery log from webhook
 */
export const updateDeliveryFromWebhook = internalMutation({
  args: {
    externalId: v.string(),
    channel: v.string(),
    status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("failed")),
    eventType: v.string(),
    eventData: v.any(),
  },
  returns: v.null(),
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
        `[resend webhook] No delivery log found for externalId: ${args.externalId}`,
      );
      return null;
    }

    // Update the delivery log
    await ctx.db.patch(log._id, {
      status: args.status,
      metadata: {
        ...(log.metadata as object),
        webhookEvent: args.eventType,
        webhookData: args.eventData,
        webhookReceivedAt: Date.now(),
      },
    });

    return null;
  },
});
