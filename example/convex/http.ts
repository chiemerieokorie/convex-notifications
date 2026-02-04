import { httpRouter } from "convex/server";
import { resendWebhook, twilioWebhook } from "convex-notifications/webhooks";

const http = httpRouter();

/**
 * Resend webhook endpoint for email delivery status updates.
 *
 * To configure:
 * 1. Go to https://resend.com/webhooks
 * 2. Add a new webhook with URL: https://<your-deployment>.convex.site/webhooks/resend
 * 3. Select events: email.sent, email.delivered, email.bounced, email.complained
 */
http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: resendWebhook,
});

/**
 * Twilio webhook endpoint for SMS delivery status updates.
 *
 * To configure:
 * 1. When sending SMS via Twilio, include StatusCallback URL:
 *    https://<your-deployment>.convex.site/webhooks/twilio/sms
 * 2. Or configure in your Twilio phone number settings
 */
http.route({
  path: "/webhooks/twilio/sms",
  method: "POST",
  handler: twilioWebhook,
});

export default http;
