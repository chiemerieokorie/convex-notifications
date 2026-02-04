/**
 * Webhook handlers for delivery status updates.
 *
 * These handlers receive webhooks from delivery providers (Resend, Twilio)
 * and update the delivery log with the latest status.
 *
 * @example
 * ```ts
 * // In your convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { resendWebhook } from "./webhooks/resend.js";
 * import { twilioWebhook } from "./webhooks/twilio.js";
 *
 * const http = httpRouter();
 *
 * http.route({
 *   path: "/webhooks/resend",
 *   method: "POST",
 *   handler: resendWebhook,
 * });
 *
 * http.route({
 *   path: "/webhooks/twilio/sms",
 *   method: "POST",
 *   handler: twilioWebhook,
 * });
 *
 * export default http;
 * ```
 */

export { resendWebhook } from "./resend.js";
export { twilioWebhook } from "./twilio.js";
