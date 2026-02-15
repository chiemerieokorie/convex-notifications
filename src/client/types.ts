import type { Auth } from "convex/server";
import type { Validator } from "convex/values";

// ---------------------------------------------------------------------------
// Context types — intentionally broad so send() works from mutation, action,
// HTTP handlers, and scheduled functions without casting.
// ---------------------------------------------------------------------------

/**
 * Minimal context needed by queries (list, unreadCount, getPreferences).
 */
export type QueryCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  auth: Auth;
};

/**
 * Minimal context needed by mutations and send().
 *
 * `scheduler` is optional — when present, SMS is auto-queued via
 * `ctx.scheduler.runAfter()` instead of requiring a separate action config.
 */
export type MutationCtx = QueryCtx & {
  runMutation: (...args: any[]) => Promise<any>;
  scheduler?: { runAfter: (...args: any[]) => Promise<any> };
};

/**
 * Action context — needed when dispatching SMS synchronously (Twilio API).
 */
export type ActionCtx = {
  runAction: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
  runQuery: (...args: any[]) => Promise<any>;
  auth: Auth;
};

/**
 * Any context that can be used with send() — mutation or action.
 */
export type SendCtx = MutationCtx | ActionCtx;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The identity returned by the auth function.
 *
 * - Single-tenant: return a userId string.
 * - Multi-tenant: return `{ userId, tenantId }`.
 */
export type AuthIdentity = string | { userId: string; tenantId: string };

// ---------------------------------------------------------------------------
// Channel configuration
// ---------------------------------------------------------------------------

export type EmailChannelConfig = {
  /** Default "from" address for emails. */
  defaultFrom: string;
  /** Enable test mode (only send to verified addresses). Defaults to true. */
  testMode?: boolean;
};

export type PushChannelConfig = {
  /**
   * Silently skip users without push tokens instead of throwing.
   * Defaults to true.
   */
  allowUnregisteredTokens?: boolean;
};

export type SmsChannelConfig = {
  /** Default "from" phone number (Twilio-verified, E.164). */
  defaultFrom: string;
};

export type ChannelConfig = {
  email?: EmailChannelConfig;
  push?: PushChannelConfig;
  sms?: SmsChannelConfig;
};

// ---------------------------------------------------------------------------
// Notification options (constructor)
// ---------------------------------------------------------------------------

export type NotificationsOptions = {
  /**
   * Channel-specific configuration.
   *
   * Static object, or a function that resolves config per tenant.
   */
  channels?: ChannelConfig | ((tenantId: string) => ChannelConfig | Promise<ChannelConfig>);

  /**
   * Resolvers for getting user contact information.
   * Called when dispatching to determine where to send.
   */
  resolvers?: {
    /** Resolve email address for a user. Return null to skip. */
    email?: (ctx: MutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
    /** Resolve phone number (E.164). Return null to skip. */
    phone?: (ctx: MutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
    /** Resolve Expo push token. Return null to skip. */
    pushToken?: (ctx: MutationCtx, userId: string, tenantId?: string) => Promise<string | null>;
  };

  /**
   * Dynamic sender identity resolvers (multi-tenant).
   * Takes priority over static channel config defaults.
   */
  senderResolvers?: {
    email?: (ctx: MutationCtx, tenantId: string) => Promise<string>;
    sms?: (ctx: MutationCtx, tenantId: string) => Promise<string>;
  };

  /**
   * Default preference mode.
   *
   * - `"opt-out"` (default): All channels enabled unless user explicitly disables.
   * - `"opt-in"`: All channels disabled unless user explicitly enables.
   */
  defaultPreferenceMode?: "opt-in" | "opt-out";
};

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

/** Inbox template — always required. */
export type InboxTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
};

export type EmailTemplate<T> = {
  subject: (data: T) => string;
  /** Plain text body (fallback for non-HTML clients). */
  body: (data: T) => string;
  /** Optional HTML body. Supports async (React Email render()). */
  html?: (data: T) => string | Promise<string>;
  /** Override the default "from" address. */
  from?: string;
};

export type PushTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
  /** Extra data payload included with the push notification. */
  data?: (data: T) => Record<string, unknown>;
};

export type SmsTemplate<T> = {
  body: (data: T) => string;
  /** Override the default "from" phone number. */
  from?: string;
};

/**
 * Channel templates for a notification event.
 *
 * `inbox` is **required** — every notification appears in the inbox.
 * Other channels are optional.
 */
export type ChannelTemplates<T> = {
  inbox: InboxTemplate<T>;
  email?: EmailTemplate<T>;
  push?: PushTemplate<T>;
  sms?: SmsTemplate<T>;
};

// ---------------------------------------------------------------------------
// Notification definition
// ---------------------------------------------------------------------------

export type NotificationDefinition<T> = {
  event: string;
  dataValidator: Validator<T, "required", string>;
  category?: string;
  /**
   * When true, this notification bypasses user preferences.
   * Use for security alerts, OTPs, password resets, etc.
   */
  required?: boolean;
  channels: ChannelTemplates<T>;
};

// ---------------------------------------------------------------------------
// Delivery result types
// ---------------------------------------------------------------------------

export type DeliveryResult = {
  channel: string;
  status: "sent" | "queued" | "failed" | "skipped";
  /** Human-readable reason (failure message, skip reason, or queue info). */
  reason?: string;
  /** External ID from the delivery provider (Resend email ID, Twilio SID). */
  externalId?: string;
};

/**
 * Discriminated union returned by send().
 *
 * - `"sent"`: Notification was created and delivery was attempted.
 * - `"deduplicated"`: A duplicate was detected and suppressed.
 */
export type SendResult =
  | {
      status: "sent";
      notificationId: string;
      deliveries: DeliveryResult[];
    }
  | {
      status: "deduplicated";
      dedupe: string;
    };
