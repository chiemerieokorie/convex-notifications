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
 * Resend uses Svix for webhook delivery, which provides signature verification
 * using HMAC-SHA256 signatures.
 *
 * @see https://resend.com/docs/webhooks
 * @see https://docs.svix.com/receiving/verifying-payloads/how
 */

import { httpAction } from "../_generated/server.js";
import { internal } from "../_generated/api.js";

/**
 * Verify Svix webhook signature.
 * Resend uses Svix which signs webhooks with HMAC-SHA256.
 */
async function verifySvixSignature(
  payload: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
  secret: string,
): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature } = headers;

  // All headers are required
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Check timestamp is within tolerance (5 minutes)
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
    return false;
  }

  // Create the signed payload
  const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;

  // Extract the secret (remove "whsec_" prefix if present)
  const secretBytes = base64ToBytes(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
  );

  // Compute expected signature
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );

  const expectedSignature = bytesToBase64(new Uint8Array(signatureBytes));

  // Svix signature header can contain multiple signatures separated by space
  // Format: "v1,<base64>" or "v1,<base64> v1,<base64>"
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const [version, sigValue] = sig.split(",");
    if (version === "v1" && sigValue === expectedSignature) {
      return true;
    }
  }

  return false;
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
 * 4. Set the RESEND_WEBHOOK_SECRET environment variable with the signing secret
 *
 * Security: This webhook verifies signatures using the RESEND_WEBHOOK_SECRET
 * environment variable. If not set, signature verification is skipped (not
 * recommended for production).
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
  // Get the raw body for signature verification
  const rawBody = await request.text();

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (webhookSecret) {
    const isValid = await verifySvixSignature(
      rawBody,
      {
        svixId: request.headers.get("svix-id"),
        svixTimestamp: request.headers.get("svix-timestamp"),
        svixSignature: request.headers.get("svix-signature"),
      },
      webhookSecret,
    );

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  // Parse the webhook payload
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
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
