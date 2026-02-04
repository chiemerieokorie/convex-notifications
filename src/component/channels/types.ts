/**
 * Channel type definitions for notification delivery.
 *
 * These types define the structure of rendered content for each channel
 * and the delivery status tracking.
 */

/**
 * Status of a delivery attempt
 */
export type DeliveryStatus = "pending" | "sent" | "delivered" | "failed";

/**
 * Result of a dispatch attempt
 */
export type DispatchResult = {
  status: DeliveryStatus;
  error?: string;
  externalId?: string;
};

/**
 * Rendered email content (for dispatch to Resend)
 */
export type RenderedEmail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
};

/**
 * Rendered push notification content (for dispatch to Expo)
 */
export type RenderedPush = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * Rendered SMS content (for dispatch to Twilio)
 */
export type RenderedSms = {
  from: string;
  to: string;
  body: string;
};

/**
 * Union of all rendered channel content types
 */
export type RenderedContent = RenderedEmail | RenderedPush | RenderedSms;

/**
 * Channel names supported by the notification system
 */
export type ChannelName = "inbox" | "email" | "push" | "sms";

/**
 * Mapping of channel names to their rendered content types
 */
export type ChannelContent = {
  inbox: { title: string; body: string };
  email: RenderedEmail;
  push: RenderedPush;
  sms: RenderedSms;
};
