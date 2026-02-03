/**
 * Channel adapters for notification delivery.
 *
 * This module provides adapters for different notification channels:
 * - Email (via Resend)
 * - Push (via Expo Push Notification Service)
 * - SMS (via Twilio)
 *
 * The inbox channel is handled separately through the notifications table.
 *
 * Usage:
 * ```ts
 * import { createDispatcher } from "./channels/index.js";
 *
 * const dispatcher = createDispatcher({
 *   email: { from: "notifications@example.com" },
 *   push: { accessToken: "..." },
 *   sms: { from: "+15551234567" },
 * });
 *
 * const result = await dispatcher.dispatch("email", "user@example.com", {
 *   subject: "Hello",
 *   body: "Welcome to our app!",
 * });
 * ```
 */

// Types
export type {
  ChannelName,
  ChannelConfig,
  ChannelAdapter,
  DeliveryStatus,
  DispatchResult,
  RenderedEmail,
  RenderedPush,
  RenderedSms,
  RenderedContent,
} from "./types.js";

// Adapters
export { EmailAdapter, createEmailAdapter } from "./email.js";
export { PushAdapter, createPushAdapter } from "./push.js";
export { SmsAdapter, createSmsAdapter } from "./sms.js";

// Dispatcher
export type { ChannelContent } from "./dispatcher.js";
export {
  ChannelDispatcher,
  createDispatcher,
  getDefaultDispatcher,
} from "./dispatcher.js";
