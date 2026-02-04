/**
 * Channel adapter types and interfaces for notification delivery.
 *
 * Each channel adapter implements the ChannelAdapter interface:
 * - render(): transforms template + data into channel-specific content
 * - dispatch(): sends the rendered content to the recipient
 */

import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel.js";

export type MutationCtx = GenericMutationCtx<DataModel>;
export type QueryCtx = GenericQueryCtx<DataModel>;

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
 * Rendered email content
 */
export type RenderedEmail = {
  subject: string;
  body: string;
  html?: string;
};

/**
 * Rendered push notification content
 */
export type RenderedPush = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * Rendered SMS content
 */
export type RenderedSms = {
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
 * Base interface for channel adapters.
 *
 * Each adapter is responsible for:
 * 1. Rendering templates with data into channel-specific content
 * 2. Dispatching the rendered content to the recipient address
 */
export interface ChannelAdapter<TRendered extends RenderedContent> {
  /**
   * Channel identifier
   */
  readonly name: ChannelName;

  /**
   * Dispatch rendered content to the recipient.
   *
   * @param address - Recipient address (email, phone number, push token, etc.)
   * @param content - Rendered content to send
   * @returns Dispatch result with status and optional error
   */
  dispatch(address: string, content: TRendered): Promise<DispatchResult>;
}

/**
 * Configuration for channel adapters
 */
export type ChannelConfig = {
  email?: {
    /** Resend API key */
    apiKey?: string;
    /** Default from address */
    from?: string;
  };
  push?: {
    /** Expo access token (optional for development) */
    accessToken?: string;
  };
  sms?: {
    /** Twilio Account SID */
    accountSid?: string;
    /** Twilio Auth Token */
    authToken?: string;
    /** Default from phone number */
    from?: string;
  };
};
