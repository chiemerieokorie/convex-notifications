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
 * Security: This webhook verifies signatures using the TWILIO_AUTH_TOKEN
 * environment variable. If not set, signature verification is skipped (not
 * recommended for production).
 *
 * @see https://www.twilio.com/docs/sms/api/message-resource#message-status-values
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */

import { httpAction } from "../_generated/server.js";
import { internal } from "../_generated/api.js";

/**
 * Verify Twilio webhook signature.
 * Twilio signs webhooks with HMAC-SHA1 using the Auth Token.
 */
async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!signature) {
    return false;
  }

  // Build the string to sign: URL + sorted params
  const sortedKeys = Object.keys(params).sort();
  let dataToSign = url;
  for (const key of sortedKeys) {
    dataToSign += key + params[key];
  }

  // Compute expected signature using HMAC-SHA1
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(dataToSign),
  );

  const expectedSignature = bytesToBase64(new Uint8Array(signatureBytes));

  return signature === expectedSignature;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
 * 4. Set the TWILIO_AUTH_TOKEN environment variable for signature verification
 *
 * Security: This webhook verifies signatures using the TWILIO_AUTH_TOKEN
 * environment variable. If not set, signature verification is skipped (not
 * recommended for production).
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

  // Convert FormData to object for signature verification
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  // Verify signature if auth token is configured
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = request.headers.get("X-Twilio-Signature");
    const url = request.url;

    const isValid = await verifyTwilioSignature(url, params, signature, authToken);
    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  const messageSid = params["MessageSid"] ?? null;
  const messageStatus = (params["MessageStatus"] ?? null) as TwilioSmsStatus | null;
  const errorCode = params["ErrorCode"] ?? null;
  const errorMessage = params["ErrorMessage"] ?? null;
  const to = params["To"] ?? null;
  const from = params["From"] ?? null;

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
