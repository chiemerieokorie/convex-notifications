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

import { httpAction } from "../_generated/server.js";
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
 * import { resendWebhook } from "./webhooks/resend.js";
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

  // Update delivery log using the shared function in delivery.ts
  await ctx.runMutation(internal.delivery.updateDeliveryFromWebhook, {
    externalId: payload.data.email_id,
    channel: "email",
    status,
    webhookData: {
      eventType: payload.type,
      ...payload.data,
    },
  });

  return new Response("OK", { status: 200 });
});
