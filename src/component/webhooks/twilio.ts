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

import { httpAction } from "../_generated/server.js";
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
 * import { twilioWebhook } from "./webhooks/twilio.js";
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
    return new Response("", { status: 200 });
  }

  // Build error message if applicable
  let error: string | undefined;
  if (errorCode || errorMessage) {
    error = errorMessage
      ? `${errorCode}: ${errorMessage}`
      : `Error code: ${errorCode}`;
  }

  // Update delivery log using the shared function in delivery.ts
  await ctx.runMutation(internal.delivery.updateDeliveryFromWebhook, {
    externalId: messageSid,
    channel: "sms",
    status,
    error,
    webhookData: {
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
