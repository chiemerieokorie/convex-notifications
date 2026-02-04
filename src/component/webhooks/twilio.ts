/**
 * Twilio webhook handler for SMS delivery status updates.
 *
 * Twilio sends status callbacks for SMS messages with these statuses:
 * - queued: Message is queued to be sent
 * - sent: Message was sent to the carrier
 * - delivered: Message was delivered to the recipient
 * - undelivered: Message could not be delivered
 * - failed: Message failed to send
 *
 * @see https://www.twilio.com/docs/sms/api/message-resource#message-status-values
 */

import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server.js";
import { internal } from "../_generated/api.js";

/**
 * Twilio SMS status values
 */
type TwilioSmsStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "canceled";

/**
 * Map Twilio status to our delivery status
 */
function mapTwilioStatusToDeliveryStatus(
  twilioStatus: TwilioSmsStatus,
): "sent" | "delivered" | "failed" | "pending" | null {
  switch (twilioStatus) {
    case "queued":
    case "sending":
      return "pending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/**
 * HTTP action to receive Twilio status callbacks.
 *
 * To use this webhook:
 * 1. Deploy your Convex app
 * 2. Configure the StatusCallback URL when sending messages:
 *    https://<your-deployment>.convex.site/webhooks/twilio/sms
 * 3. Or configure it in your Twilio phone number settings
 *
 * @example
 * ```ts
 * // In your convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { twilioWebhook } from "convex-notifications";
 *
 * const http = httpRouter();
 * http.route({
 *   path: "/webhooks/twilio/sms",
 *   method: "POST",
 *   handler: twilioWebhook,
 * });
 * export default http;
 * ```
 */
export const twilioWebhook = httpAction(async (ctx, request) => {
  // Twilio sends form-urlencoded data
  const formData = await request.formData();

  const messageSid = formData.get("MessageSid") as string | null;
  const messageStatus = formData.get("MessageStatus") as TwilioSmsStatus | null;
  const errorCode = formData.get("ErrorCode") as string | null;
  const errorMessage = formData.get("ErrorMessage") as string | null;
  const to = formData.get("To") as string | null;
  const from = formData.get("From") as string | null;

  // Validate required fields
  if (!messageSid || !messageStatus) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Map status
  const status = mapTwilioStatusToDeliveryStatus(messageStatus);
  if (!status) {
    return new Response("OK", { status: 200 });
  }

  // Build error message if applicable
  let error: string | undefined;
  if (errorCode || errorMessage) {
    error = errorMessage
      ? `${errorCode}: ${errorMessage}`
      : `Error code: ${errorCode}`;
  }

  // Update delivery log
  await ctx.runMutation(internal.webhooks.twilio.updateDeliveryFromWebhook, {
    externalId: messageSid,
    channel: "sms",
    status,
    error,
    eventData: {
      messageSid,
      messageStatus,
      errorCode,
      errorMessage,
      to,
      from,
    },
  });

  // Twilio expects empty 200 response
  return new Response("", { status: 200 });
});

/**
 * Internal mutation to update delivery log from Twilio webhook
 */
export const updateDeliveryFromWebhook = internalMutation({
  args: {
    externalId: v.string(),
    channel: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
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
        `[twilio webhook] No delivery log found for messageSid: ${args.externalId}`,
      );
      return null;
    }

    // Update the delivery log
    await ctx.db.patch(log._id, {
      status: args.status,
      error: args.error,
      sentAt: args.status === "sent" || args.status === "delivered" ? Date.now() : undefined,
      metadata: {
        ...(log.metadata as object),
        twilioStatus: args.eventData,
        webhookReceivedAt: Date.now(),
      },
    });

    return null;
  },
});
