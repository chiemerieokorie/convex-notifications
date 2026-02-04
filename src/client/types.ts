import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { Validator } from "convex/values";

// Context types for resolvers and adapters
export type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
  auth: Auth;
};

export type RunMutationCtx = RunQueryCtx & {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
  scheduler: GenericMutationCtx<GenericDataModel>["scheduler"];
};

export type RunActionCtx = {
  runAction: GenericActionCtx<GenericDataModel>["runAction"];
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"];
  auth: Auth;
};

// Channel configuration
export type EmailChannelConfig = {
  /**
   * Default "from" address for emails.
   * Can be overridden per notification definition.
   */
  defaultFrom: string;
  /**
   * Whether to enable test mode (only send to verified addresses).
   * Defaults to true.
   */
  testMode?: boolean;
};

export type PushChannelConfig = {
  /**
   * Whether to allow sending to users without registered tokens.
   * If true, notifications to users without tokens are silently skipped.
   * If false, throws an error.
   * Defaults to true.
   */
  allowUnregisteredTokens?: boolean;
};

export type SmsChannelConfig = {
  /**
   * Default "from" phone number for SMS messages.
   * Must be a Twilio-verified phone number.
   */
  defaultFrom: string;
};

export type ChannelConfig = {
  email?: EmailChannelConfig;
  push?: PushChannelConfig;
  sms?: SmsChannelConfig;
};

// Notification options
export type NotificationsOptions = {
  /**
   * Function to get the authenticated user ID from the context.
   * Called for all inbox-related operations.
   */
  auth: (ctx: { auth: Auth }) => Promise<string>;

  /**
   * Channel-specific configuration.
   * Configure this to enable delivery through each channel.
   */
  channels?: ChannelConfig;

  /**
   * Resolvers for getting user contact information.
   * These are called when dispatching notifications to determine
   * where to send them.
   */
  resolvers?: {
    /**
     * Resolve email address for a user.
     * Return null if the user has no email.
     */
    email?: (ctx: RunMutationCtx, userId: string) => Promise<string | null>;
    /**
     * Resolve phone number for a user (E.164 format, e.g., +14155551234).
     * Return null if the user has no phone.
     */
    phone?: (ctx: RunMutationCtx, userId: string) => Promise<string | null>;
    /**
     * Resolve Expo push token for a user.
     * Return null if the user has no push token registered.
     * Note: If using the expo-push-notifications component, tokens are
     * managed internally and this resolver may not be needed.
     */
    pushToken?: (ctx: RunMutationCtx, userId: string) => Promise<string | null>;
  };

  /**
   * Internal action reference for dispatching SMS.
   * SMS requires action context (for Twilio API calls).
   * If not provided, SMS dispatch will be logged but not sent.
   */
  smsDispatchAction?: FunctionReference<"action", "internal">;
};

// Template types
export type InboxTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
};

export type EmailTemplate<T> = {
  subject: (data: T) => string;
  /** Plain text body for email clients that don't support HTML */
  body: (data: T) => string;
  /**
   * Optional HTML body for rich email content.
   * Use with React Email: `html: (data) => render(<WelcomeEmail name={data.name} />)`
   */
  html?: (data: T) => string | Promise<string>;
  /**
   * Override the default "from" address for this notification.
   */
  from?: string;
};

export type PushTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
  /**
   * Optional data payload to include with the notification.
   */
  data?: (data: T) => Record<string, unknown>;
};

export type SmsTemplate<T> = {
  body: (data: T) => string;
  /**
   * Override the default "from" phone number for this notification.
   */
  from?: string;
};

export type ChannelTemplates<T> = {
  inbox?: InboxTemplate<T>;
  email?: EmailTemplate<T>;
  push?: PushTemplate<T>;
  sms?: SmsTemplate<T>;
};

export type NotificationDefinition<T> = {
  event: string;
  dataValidator: Validator<T, "required", string>;
  category?: string;
  channels: ChannelTemplates<T>;
};

// Delivery result types
export type DeliveryResult = {
  channel: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  externalId?: string;
};

export type SendResult = {
  notificationId: string;
  deliveries: DeliveryResult[];
};
