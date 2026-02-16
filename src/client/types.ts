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

/**
 * The identity returned by the auth function.
 * For single-tenant apps, can return just a userId string (backwards compatible).
 * For multi-tenant apps, return an object with userId and tenantId.
 */
export type AuthIdentity = string | { userId: string; tenantId: string };

// Notification options
export type NotificationsOptions = {
  /**
   * Function to get the authenticated user identity from the context.
   * Called for all inbox-related operations.
   *
   * For single-tenant apps, return a userId string.
   * For multi-tenant apps, return `{ userId, tenantId }`.
   */
  auth: (ctx: { auth: Auth }) => Promise<AuthIdentity>;

  /**
   * Channel-specific configuration.
   * Configure this to enable delivery through each channel.
   *
   * Can be a static config or a function that resolves config per tenant.
   */
  channels?: ChannelConfig | ((tenantId: string) => ChannelConfig | Promise<ChannelConfig>);

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
    email?: (ctx: RunMutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
    /**
     * Resolve phone number for a user (E.164 format, e.g., +14155551234).
     * Return null if the user has no phone.
     */
    phone?: (ctx: RunMutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
    /**
     * Resolve Expo push token for a user.
     * Return null if the user has no push token registered.
     * Note: If using the expo-push-notifications component, tokens are
     * managed internally and this resolver may not be needed.
     */
    pushToken?: (ctx: RunMutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
  };

  /**
   * Dynamic sender identity resolvers.
   * Called at send time to resolve the "from" address per tenant.
   * Takes priority over static channel config defaults.
   *
   * Use this when tenants have their own phone numbers, email domains, etc.
   *
   * @example
   * ```ts
   * senderResolvers: {
   *   email: async (ctx, tenantId) => {
   *     const tenant = await ctx.db.get(tenantId);
   *     return `notifications@${tenant.domain}`;
   *   },
   *   sms: async (ctx, tenantId) => {
   *     const tenant = await ctx.db.get(tenantId);
   *     return tenant.twilioPhoneNumber;
   *   },
   * }
   * ```
   */
  senderResolvers?: {
    /** Resolve the "from" email address for a tenant. */
    email?: (ctx: RunMutationCtx, tenantId: string) => Promise<string>;
    /** Resolve the "from" phone number for a tenant (E.164 format). */
    sms?: (ctx: RunMutationCtx, tenantId: string) => Promise<string>;
  };

  /**
   * Internal action reference for dispatching SMS.
   * SMS requires action context (for Twilio API calls).
   * If not provided, SMS dispatch will be logged but not sent.
   *
   * The action receives `{ notificationId: string; rendered: RenderedSms }`.
   */
  smsDispatchAction?: FunctionReference<
    "action",
    "internal",
    { notificationId: string; rendered: { from: string; to: string; body: string } }
  >;
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
  /** Inbox template is required — all notifications appear in the inbox. */
  inbox: InboxTemplate<T>;
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

// --- Consumer-facing document types ---
// These represent the shapes returned by queries and hooks.
// Use `string` for `_id` fields since consumers don't own the component's tables.

export type Notification = {
  _id: string;
  _creationTime: number;
  tenantId?: string;
  userId: string;
  event: string;
  title: string;
  body: string;
  data?: unknown;
  readAt?: number;
  archivedAt?: number;
  transactional?: boolean;
};

export type Preference = {
  _id: string;
  _creationTime: number;
  tenantId?: string;
  userId: string;
  level: "global" | "category" | "event";
  key?: string;
  channel: string;
  enabled: boolean;
};

export type DeliveryLog = {
  _id: string;
  _creationTime: number;
  tenantId?: string;
  notificationId: string;
  channel: string;
  status: "pending" | "sent" | "delivered" | "failed";
  error?: string;
  sentAt?: number;
  metadata?: unknown;
  externalId?: string;
};

export type PushToken = {
  _id: string;
  _creationTime: number;
  tenantId?: string;
  userId: string;
  token: string;
  platform?: "ios" | "android" | "web";
  deviceId?: string;
};

export type ScheduledNotification = {
  _id: string;
  _creationTime: number;
  tenantId?: string;
  userId: string;
  event: string;
  category?: string;
  title: string;
  body: string;
  data?: unknown;
  channels: unknown;
  scheduledFor: number;
  transactional?: boolean;
  deduplicationKey?: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  error?: string;
  processedAt?: number;
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
