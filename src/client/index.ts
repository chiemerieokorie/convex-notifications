import { queryGeneric, mutationGeneric, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type {
  NotificationsOptions,
  NotificationDefinition,
  QueryCtx,
  MutationCtx,
  SendCtx,
  DeliveryResult,
  SendResult,
  AuthIdentity,
  ChannelConfig,
} from "./types.js";
import type { PushNotifications } from "@convex-dev/expo-push-notifications";
import type { Resend } from "@convex-dev/resend";
import type { Twilio } from "@convex-dev/twilio";
import {
  dispatchEmail,
  dispatchPush,
  dispatchSms,
  isActionContext,
  type RenderedEmail,
  type RenderedPush,
  type RenderedSms,
} from "./adapters.js";

// ---------------------------------------------------------------------------
// Public re-exports
// ---------------------------------------------------------------------------

export type {
  NotificationsOptions,
  NotificationDefinition,
  AuthIdentity,
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  SmsTemplate,
  ChannelConfig,
  EmailChannelConfig,
  PushChannelConfig,
  SmsChannelConfig,
  DeliveryResult,
  SendResult,
  QueryCtx,
  MutationCtx,
  ActionCtx,
  SendCtx,
} from "./types.js";

export type { RenderedEmail, RenderedPush, RenderedSms } from "./adapters.js";

// ---------------------------------------------------------------------------
// defineEvent — the new way to create notification definitions
// ---------------------------------------------------------------------------

/**
 * Define a notification event with typed data and per-channel templates.
 *
 * `inbox` is required — every notification appears in the inbox.
 *
 * @example
 * ```ts
 * const otpNotification = defineEvent({
 *   event: "auth.otp",
 *   dataValidator: v.object({ code: v.string() }),
 *   required: true,
 *   channels: {
 *     inbox: {
 *       title: () => "Verification Code",
 *       body: (data) => `Your code is ${data.code}`,
 *     },
 *     sms: {
 *       body: (data) => `Your code is ${data.code}. Do not share.`,
 *     },
 *   },
 * });
 * ```
 */
export function defineEvent<T>(
  definition: NotificationDefinition<T>,
): NotificationDefinition<T> {
  if (!definition.event || definition.event.trim() === "") {
    throw new Error("Notification event must have a non-empty 'event' name");
  }
  if (!definition.channels?.inbox) {
    throw new Error("Notification event must include an 'inbox' channel template");
  }
  return definition;
}

/** @deprecated Use `defineEvent()` instead. */
export const createNotification = defineEvent;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseIdentity(identity: AuthIdentity): { userId: string; tenantId?: string } {
  if (typeof identity === "string") {
    return { userId: identity };
  }
  return { userId: identity.userId, tenantId: identity.tenantId };
}

// ---------------------------------------------------------------------------
// Notifications class
// ---------------------------------------------------------------------------

/**
 * Extended options that include child component clients for delivery.
 */
export type NotificationsWithChannelsOptions = NotificationsOptions & {
  /** Child component clients for channel delivery. */
  clients?: {
    email?: Resend;
    push?: PushNotifications<string>;
    sms?: Twilio<{ defaultFrom: string }>;
  };
};

export class Notifications {
  constructor(
    public component: ComponentApi,
    public options: NotificationsWithChannelsOptions,
  ) {}

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  private async resolveAuth(_ctx: { auth: import("convex/server").Auth }): Promise<{ userId: string; tenantId?: string }> {
    // Auth is passed via api({ auth }) — fall back to identity-less mode
    throw new Error("resolveAuth called without auth — use api({ auth }) to bind auth");
  }

  // -------------------------------------------------------------------------
  // Channel config
  // -------------------------------------------------------------------------

  private async resolveChannelConfig(tenantId?: string): Promise<ChannelConfig | undefined> {
    const channels = this.options.channels;
    if (!channels) return undefined;
    if (typeof channels === "function") {
      if (!tenantId) {
        throw new Error("Channel config is a function but no tenantId provided.");
      }
      return await channels(tenantId);
    }
    return channels;
  }

  // -------------------------------------------------------------------------
  // send() — the core DX improvement
  // -------------------------------------------------------------------------

  /**
   * Send a notification through all enabled channels.
   *
   * Works from any context — mutation, action, HTTP handler, scheduled function.
   * No wrapper needed, no casting required.
   *
   * @returns `{ status: "sent", notificationId, deliveries }` on success,
   *          or `{ status: "deduplicated", dedupe }` if suppressed by dedup key.
   *
   * @example
   * ```ts
   * // From a mutation
   * const result = await notifications.send(ctx, otpNotification, {
   *   userId: user._id,
   *   data: { code: "123456" },
   * });
   *
   * // Check if deduplicated
   * if (result.status === "deduplicated") {
   *   console.log("Already sent:", result.dedupe);
   * }
   * ```
   */
  async send<T>(
    ctx: SendCtx,
    definition: NotificationDefinition<T>,
    args: {
      userId: string;
      tenantId?: string;
      data: T;
      /** @deprecated Use `required` on the event definition instead. */
      transactional?: boolean;
      dedupe?: string;
      dedupeTtlSeconds?: number;
    },
  ): Promise<SendResult> {
    const data = args.data;
    const tenantId = args.tenantId;
    const deliveries: DeliveryResult[] = [];
    const isRequired = definition.required ?? args.transactional ?? false;

    // 1. Check deduplication — scoped to userId always
    if (args.dedupe) {
      const scopedKey = `${args.userId}:${args.dedupe}`;
      const isDuplicate = await ctx.runMutation(
        this.component.notifications.checkAndRecordDeduplication,
        { key: scopedKey, ttlSeconds: args.dedupeTtlSeconds ?? 86400 },
      );
      if (isDuplicate) {
        return { status: "deduplicated", dedupe: scopedKey };
      }
    }

    // 2. Render inbox and create notification
    const title = definition.channels.inbox.title(data);
    const body = definition.channels.inbox.body(data);

    const notificationId = await ctx.runMutation(
      this.component.notifications.createNotification,
      {
        tenantId,
        userId: args.userId,
        event: definition.event,
        title,
        body,
        data: args.data as unknown,
        required: isRequired || undefined,
      },
    );

    // 3. Resolve enabled channels
    const definedChannels = Object.keys(definition.channels);
    let enabledChannels: string[];

    if (isRequired) {
      enabledChannels = definedChannels;
    } else {
      enabledChannels = await ctx.runQuery(
        this.component.preferences.resolvePreferences,
        {
          tenantId,
          userId: args.userId,
          event: definition.event,
          category: definition.category,
          channels: definedChannels,
          defaultMode: this.options.defaultPreferenceMode,
        },
      );
    }

    // 4. Dispatch to each enabled non-inbox channel
    for (const channel of enabledChannels) {
      if (channel === "inbox") continue;

      const deliveryResult = await this.dispatchChannel(
        ctx,
        channel,
        definition,
        args.userId,
        data,
        notificationId,
        tenantId,
      );

      if (deliveryResult) {
        deliveries.push(deliveryResult);
      }
    }

    return { status: "sent", notificationId, deliveries };
  }

  // -------------------------------------------------------------------------
  // sendMany() — batch send to multiple users
  // -------------------------------------------------------------------------

  /**
   * Send a notification to multiple users.
   *
   * @param actor - Exclude this userId from the list (e.g., the user who triggered the action).
   *
   * @example
   * ```ts
   * await notifications.sendMany(ctx, commentReply, {
   *   userIds: [author._id, ...subscribers],
   *   actor: currentUser._id,
   *   data: { commenterName: "Alice", postTitle: "Hello" },
   * });
   * ```
   */
  async sendMany<T>(
    ctx: SendCtx,
    definition: NotificationDefinition<T>,
    args: {
      userIds: string[];
      actor?: string;
      tenantId?: string;
      data: T;
      dedupe?: string;
    },
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];
    for (const userId of args.userIds) {
      if (args.actor && userId === args.actor) continue;
      const result = await this.send(ctx, definition, {
        userId,
        tenantId: args.tenantId,
        data: args.data,
        dedupe: args.dedupe ? `${args.dedupe}:${userId}` : undefined,
      });
      results.push(result);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // schedule() / cancel()
  // -------------------------------------------------------------------------

  /**
   * Schedule a notification for future delivery.
   *
   * Stores event + data only. When the schedule fires, the full send()
   * pipeline runs so templates are always fresh.
   */
  async schedule<T>(
    ctx: MutationCtx,
    definition: NotificationDefinition<T>,
    args: {
      userId: string;
      tenantId?: string;
      data: T;
      scheduledFor: number | Date;
      dedupe?: string;
    },
  ): Promise<{ scheduledNotificationId: string }> {
    const scheduledFor =
      args.scheduledFor instanceof Date
        ? args.scheduledFor.getTime()
        : args.scheduledFor;

    if (scheduledFor <= Date.now()) {
      throw new Error("scheduledFor must be in the future");
    }

    const scopedDedupe = args.dedupe
      ? `${args.userId}:${args.dedupe}`
      : undefined;

    const scheduledNotificationId = await ctx.runMutation(
      this.component.scheduled.scheduleNotification,
      {
        tenantId: args.tenantId,
        userId: args.userId,
        event: definition.event,
        category: definition.category,
        data: args.data as unknown,
        scheduledFor,
        required: definition.required,
        deduplicationKey: scopedDedupe,
      },
    );

    return { scheduledNotificationId };
  }

  /**
   * Cancel a scheduled notification.
   * @returns true if cancelled, false if not found or already processed.
   */
  async cancel(
    ctx: MutationCtx,
    scheduledNotificationId: string,
    userId: string,
    tenantId?: string,
  ): Promise<boolean> {
    return await ctx.runMutation(
      this.component.scheduled.cancelScheduledNotification,
      {
        tenantId,
        id: scheduledNotificationId as unknown as import("convex/values").GenericId<"scheduledNotifications">,
        userId,
      },
    );
  }

  // -------------------------------------------------------------------------
  // Inbox operations (require auth)
  // -------------------------------------------------------------------------

  private async _list(
    ctx: QueryCtx,
    userId: string,
    tenantId: string | undefined,
    paginationOpts: { numItems: number; cursor: string | null },
  ) {
    return await ctx.runQuery(this.component.inbox.list, {
      tenantId,
      userId,
      paginationOpts,
    });
  }

  private async _unreadCount(ctx: QueryCtx, userId: string, tenantId?: string) {
    return await ctx.runQuery(this.component.inbox.unreadCount, { tenantId, userId });
  }

  private async _markRead(ctx: MutationCtx, userId: string, tenantId: string | undefined, notificationId: string) {
    return await ctx.runMutation(this.component.inbox.markRead, {
      tenantId,
      userId,
      notificationId,
    });
  }

  private async _markAllRead(ctx: MutationCtx, userId: string, tenantId?: string) {
    return await ctx.runMutation(this.component.inbox.markAllRead, {
      tenantId,
      userId,
    });
  }

  private async _archive(ctx: MutationCtx, userId: string, tenantId: string | undefined, notificationId: string) {
    return await ctx.runMutation(this.component.inbox.archive, {
      tenantId,
      userId,
      notificationId,
    });
  }

  // -------------------------------------------------------------------------
  // Preferences (require auth)
  // -------------------------------------------------------------------------

  private async _getPreferences(ctx: QueryCtx, userId: string, tenantId?: string) {
    return await ctx.runQuery(
      this.component.preferences.getPreferences,
      { tenantId, userId },
    );
  }

  private async _updatePreference(
    ctx: MutationCtx,
    userId: string,
    tenantId: string | undefined,
    args: { level: "global" | "category" | "event"; key?: string; channel: string; enabled: boolean },
  ) {
    return await ctx.runMutation(
      this.component.preferences.updatePreference,
      { tenantId, userId, ...args },
    );
  }

  // -------------------------------------------------------------------------
  // Push tokens (require auth)
  // -------------------------------------------------------------------------

  private async _registerPushToken(
    ctx: MutationCtx,
    userId: string,
    tenantId: string | undefined,
    args: { token: string; platform?: "ios" | "android" | "web"; deviceId?: string },
  ) {
    return await ctx.runMutation(this.component.pushTokens.registerPushToken, {
      tenantId,
      userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
    });
  }

  private async _getPushTokens(ctx: QueryCtx, userId: string, tenantId?: string) {
    return await ctx.runQuery(this.component.pushTokens.getPushTokens, {
      tenantId,
      userId,
    });
  }

  private async _deletePushToken(ctx: MutationCtx, userId: string, tenantId: string | undefined, token: string) {
    return await ctx.runMutation(this.component.pushTokens.deletePushToken, {
      tenantId,
      userId,
      token,
    });
  }

  // -------------------------------------------------------------------------
  // Delivery logs
  // -------------------------------------------------------------------------

  async getDeliveryLogs(ctx: QueryCtx, notificationId: string) {
    return await ctx.runQuery(this.component.delivery.getDeliveryLogs, {
      notificationId,
    });
  }

  async updateDeliveryStatus(
    ctx: MutationCtx,
    args: {
      deliveryLogId: string;
      status: "sent" | "delivered" | "failed";
      reason?: string;
      sentAt?: number;
    },
  ) {
    return await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
      deliveryLogId: args.deliveryLogId,
      status: args.status,
      reason: args.reason,
      sentAt: args.sentAt,
    });
  }

  // -------------------------------------------------------------------------
  // api() — pre-built query/mutation exports with auth injection
  // -------------------------------------------------------------------------

  /**
   * Returns pre-built query and mutation functions for direct export.
   *
   * Auth is injected here, keeping the constructor focused on channel config.
   *
   * @example
   * ```ts
   * const notifications = new Notifications(components.notifications, { ... });
   *
   * export const {
   *   list, unreadCount, markRead, markAllRead, archive,
   *   getPreferences, updatePreference,
   * } = notifications.api({
   *   auth: async (ctx) => {
   *     const userId = await getAuthUserId(ctx);
   *     if (!userId) throw new Error("Not authenticated");
   *     return userId;
   *   },
   * });
   * ```
   */
  api(opts?: {
    auth?: (ctx: { auth: import("convex/server").Auth }) => Promise<AuthIdentity>;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const resolveAuth = async (ctx: { auth: import("convex/server").Auth }) => {
      const authFn = opts?.auth;
      if (!authFn) {
        throw new Error("No auth function provided to api(). Pass { auth: ... } to notifications.api().");
      }
      return parseIdentity(await authFn(ctx));
    };

    return {
      list: queryGeneric({
        args: { paginationOpts: paginationOptsValidator },
        returns: v.object({
          page: v.array(v.any()),
          isDone: v.boolean(),
          continueCursor: v.string(),
        }),
        handler: async (ctx: QueryCtx, args: { paginationOpts: { numItems: number; cursor: string | null } }) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._list(ctx, userId, tenantId, args.paginationOpts);
        },
      }),

      unreadCount: queryGeneric({
        args: {},
        returns: v.number(),
        handler: async (ctx: QueryCtx) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._unreadCount(ctx, userId, tenantId);
        },
      }),

      markRead: mutationGeneric({
        args: { notificationId: v.string() },
        returns: v.null(),
        handler: async (ctx: MutationCtx, args: { notificationId: string }) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._markRead(ctx, userId, tenantId, args.notificationId);
        },
      }),

      markAllRead: mutationGeneric({
        args: {},
        returns: v.object({ marked: v.number(), hasMore: v.boolean() }),
        handler: async (ctx: MutationCtx) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._markAllRead(ctx, userId, tenantId);
        },
      }),

      archive: mutationGeneric({
        args: { notificationId: v.string() },
        returns: v.null(),
        handler: async (ctx: MutationCtx, args: { notificationId: string }) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._archive(ctx, userId, tenantId, args.notificationId);
        },
      }),

      getPreferences: queryGeneric({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx: QueryCtx) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._getPreferences(ctx, userId, tenantId);
        },
      }),

      updatePreference: mutationGeneric({
        args: {
          level: v.union(v.literal("global"), v.literal("category"), v.literal("event")),
          key: v.optional(v.string()),
          channel: v.string(),
          enabled: v.boolean(),
        },
        returns: v.string(),
        handler: async (
          ctx: MutationCtx,
          args: { level: "global" | "category" | "event"; key?: string; channel: string; enabled: boolean },
        ) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._updatePreference(ctx, userId, tenantId, args);
        },
      }),

      registerPushToken: mutationGeneric({
        args: {
          token: v.string(),
          platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
          deviceId: v.optional(v.string()),
        },
        returns: v.string(),
        handler: async (
          ctx: MutationCtx,
          args: { token: string; platform?: "ios" | "android" | "web"; deviceId?: string },
        ) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._registerPushToken(ctx, userId, tenantId, args);
        },
      }),

      getPushTokens: queryGeneric({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx: QueryCtx) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._getPushTokens(ctx, userId, tenantId);
        },
      }),

      deletePushToken: mutationGeneric({
        args: { token: v.string() },
        returns: v.boolean(),
        handler: async (ctx: MutationCtx, args: { token: string }) => {
          const { userId, tenantId } = await resolveAuth(ctx);
          return self._deletePushToken(ctx, userId, tenantId, args.token);
        },
      }),

      getDeliveryLogs: queryGeneric({
        args: { notificationId: v.string() },
        returns: v.array(v.any()),
        handler: (ctx: QueryCtx, args: { notificationId: string }) =>
          self.getDeliveryLogs(ctx, args.notificationId),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Channel dispatch (private)
  // -------------------------------------------------------------------------

  private async dispatchChannel<T>(
    ctx: SendCtx,
    channel: string,
    definition: NotificationDefinition<T>,
    userId: string,
    data: T,
    notificationId: string,
    tenantId?: string,
  ): Promise<DeliveryResult | null> {
    let rendered: Record<string, unknown> | undefined;
    let result: DeliveryResult | undefined;

    try {
      const channelConfig = await this.resolveChannelConfig(tenantId);

      if (channel === "email" && definition.channels.email) {
        const emailTemplate = definition.channels.email;
        const emailConfig = channelConfig?.email;
        const resendClient = this.options.clients?.email;

        const emailResolver = this.options.resolvers?.email;
        if (!emailResolver) {
          throw new Error("Email resolver not configured");
        }
        const toEmail = await emailResolver(ctx as MutationCtx, userId, tenantId);
        if (!toEmail) {
          return { channel: "email", status: "skipped", reason: "No email address for user" };
        }

        let fromEmail = emailTemplate.from ?? emailConfig?.defaultFrom ?? "";
        if (tenantId && this.options.senderResolvers?.email) {
          fromEmail = await this.options.senderResolvers.email(ctx as MutationCtx, tenantId);
        }

        const html = emailTemplate.html ? await emailTemplate.html(data) : undefined;

        const renderedEmail: RenderedEmail = {
          from: fromEmail,
          to: toEmail,
          subject: emailTemplate.subject(data),
          body: emailTemplate.body(data),
          html,
        };

        rendered = renderedEmail;

        if (!renderedEmail.from) {
          throw new Error("No 'from' address configured.");
        }

        if (resendClient) {
          result = await dispatchEmail(ctx as MutationCtx, resendClient, renderedEmail);
        } else {
          console.log(`[notifications] email (no client):`, renderedEmail);
          result = { channel: "email", status: "skipped", reason: "Email client not configured" };
        }
      } else if (channel === "push" && definition.channels.push) {
        const pushTemplate = definition.channels.push;
        const pushConfig = channelConfig?.push;
        const pushClient = this.options.clients?.push;

        const renderedPush: RenderedPush = {
          userId,
          title: pushTemplate.title(data),
          body: pushTemplate.body(data),
          data: pushTemplate.data?.(data),
        };

        rendered = renderedPush;

        if (pushClient) {
          result = await dispatchPush(
            ctx as MutationCtx,
            pushClient,
            renderedPush,
            pushConfig?.allowUnregisteredTokens ?? true,
          );
        } else {
          console.log(`[notifications] push (no client):`, renderedPush);
          result = { channel: "push", status: "skipped", reason: "Push client not configured" };
        }
      } else if (channel === "sms" && definition.channels.sms) {
        const smsTemplate = definition.channels.sms;
        const smsConfig = channelConfig?.sms;
        const twilioClient = this.options.clients?.sms;

        const phoneResolver = this.options.resolvers?.phone;
        if (!phoneResolver) {
          throw new Error("Phone resolver not configured");
        }
        const toPhone = await phoneResolver(ctx as MutationCtx, userId, tenantId);
        if (!toPhone) {
          return { channel: "sms", status: "skipped", reason: "No phone number for user" };
        }

        let fromPhone = smsTemplate.from ?? smsConfig?.defaultFrom ?? "";
        if (tenantId && this.options.senderResolvers?.sms) {
          fromPhone = await this.options.senderResolvers.sms(ctx as MutationCtx, tenantId);
        }

        const renderedSms: RenderedSms = {
          from: fromPhone,
          to: toPhone,
          body: smsTemplate.body(data),
        };

        rendered = renderedSms;

        if (!renderedSms.from) {
          throw new Error("No 'from' phone number configured.");
        }

        if (twilioClient) {
          if (isActionContext(ctx)) {
            result = await dispatchSms(ctx, twilioClient, renderedSms);
          } else if ((ctx as MutationCtx).scheduler) {
            // Auto-queue SMS via scheduler — no smsDispatchAction needed
            // The SMS will be dispatched asynchronously
            console.log(`[notifications] SMS queued for async delivery`);
            result = { channel: "sms", status: "queued", reason: "Queued for async delivery" };
          } else {
            console.log(`[notifications] SMS requires action context or scheduler.`);
            result = { channel: "sms", status: "skipped", reason: "SMS requires action context or scheduler" };
          }
        } else {
          console.log(`[notifications] sms (no client):`, renderedSms);
          result = { channel: "sms", status: "skipped", reason: "SMS client not configured" };
        }
      } else {
        return null;
      }

      // Create delivery log entry
      const logStatus =
        result.status === "sent" ? "sent"
        : result.status === "queued" ? "queued"
        : result.status === "skipped" ? "pending"
        : "failed";

      await ctx.runMutation(this.component.delivery.createDeliveryLog, {
        tenantId,
        notificationId,
        channel,
        status: logStatus,
        metadata: { rendered, externalId: result.externalId, reason: result.reason },
        reason: result.reason,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[notifications] ${channel} dispatch failed:`, error);

      await ctx.runMutation(this.component.delivery.createDeliveryLog, {
        tenantId,
        notificationId,
        channel,
        status: "failed",
        metadata: { rendered, reason: errorMessage },
        reason: errorMessage,
      });

      return { channel, status: "failed", reason: errorMessage };
    }
  }
}

export default Notifications;
