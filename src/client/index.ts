import type {
  Auth,
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import { queryGeneric, mutationGeneric } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type {
  NotificationsOptions,
  NotificationDefinition,
  RunQueryCtx,
  RunMutationCtx,
  RunActionCtx,
  DeliveryResult,
  SendResult,
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

export type { NotificationsOptions, NotificationDefinition } from "./types.js";
export type {
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
  RunQueryCtx,
  RunMutationCtx,
  RunActionCtx,
} from "./types.js";

/**
 * Create a typed notification definition.
 *
 * This helper function provides runtime validation and type inference
 * for notification definitions.
 *
 * @example
 * ```ts
 * const welcomeNotification = createNotification({
 *   event: "user.welcome",
 *   dataValidator: v.object({ userName: v.string() }),
 *   category: "onboarding",
 *   channels: {
 *     inbox: {
 *       title: (data) => `Welcome, ${data.userName}!`,
 *       body: () => "Thanks for joining.",
 *     },
 *     email: {
 *       subject: (data) => `Welcome, ${data.userName}!`,
 *       body: (data) => `Hi ${data.userName}, welcome aboard!`,
 *     },
 *   },
 * });
 * ```
 */
export function createNotification<T>(
  definition: NotificationDefinition<T>,
): NotificationDefinition<T> {
  // Validate required fields
  if (!definition.event || definition.event.trim() === "") {
    throw new Error("Notification definition must have a non-empty 'event' name");
  }

  if (!definition.channels || Object.keys(definition.channels).length === 0) {
    throw new Error("Notification definition must have at least one channel template");
  }

  // Validate that at least inbox is defined (required for all notifications)
  if (!definition.channels.inbox) {
    throw new Error("Notification definition must include an 'inbox' channel template");
  }

  return definition;
}

/**
 * Extended options that include child component clients for delivery.
 */
export type NotificationsWithChannelsOptions = NotificationsOptions & {
  /**
   * Child component clients for channel delivery.
   * Pass these to enable actual delivery through each channel.
   */
  clients?: {
    /**
     * Resend client for email delivery.
     * Create with: new Resend(components.resend, { ... })
     */
    email?: Resend;
    /**
     * Expo Push Notifications client for push delivery.
     * Create with: new PushNotifications(components.pushNotifications, { ... })
     */
    push?: PushNotifications<string>;
    /**
     * Twilio client for SMS delivery.
     * Create with: new Twilio(components.twilio, { ... })
     */
    sms?: Twilio<{ defaultFrom: string }>;
  };
};

export class Notifications {
  constructor(
    public component: ComponentApi,
    public options: NotificationsWithChannelsOptions,
  ) {}

  async list(
    ctx: RunQueryCtx,
    opts?: { limit?: number; cursor?: number },
  ) {
    const userId = await this.options.auth(ctx);
    return await ctx.runQuery(this.component.inbox.list, {
      userId,
      ...opts,
    });
  }

  async unreadCount(ctx: RunQueryCtx) {
    const userId = await this.options.auth(ctx);
    return await ctx.runQuery(this.component.inbox.unreadCount, { userId });
  }

  async markRead(ctx: RunMutationCtx, notificationId: string) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.inbox.markRead, {
      userId,
      notificationId,
    });
  }

  async markAllRead(ctx: RunMutationCtx) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.inbox.markAllRead, {
      userId,
    });
  }

  async archive(ctx: RunMutationCtx, notificationId: string) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.inbox.archive, {
      userId,
      notificationId,
    });
  }

  async getPreferences(ctx: RunQueryCtx) {
    const userId = await this.options.auth(ctx);
    return await ctx.runQuery(
      this.component.preferences.getPreferences,
      { userId },
    );
  }

  async updatePreference(
    ctx: RunMutationCtx,
    args: {
      level: "global" | "category" | "event";
      key?: string;
      channel: string;
      enabled: boolean;
    },
  ) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(
      this.component.preferences.updatePreference,
      { userId, ...args },
    );
  }

  /**
   * Register a push notification token for a user.
   * Uses the component's internal push token storage.
   */
  async registerPushToken(
    ctx: RunMutationCtx,
    args: {
      token: string;
      platform?: "ios" | "android" | "web";
      deviceId?: string;
    },
  ) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.pushTokens.registerPushToken, {
      userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
    });
  }

  /**
   * Get all push tokens for the current user.
   */
  async getPushTokens(ctx: RunQueryCtx) {
    const userId = await this.options.auth(ctx);
    return await ctx.runQuery(this.component.pushTokens.getPushTokens, {
      userId,
    });
  }

  /**
   * Delete a push token.
   */
  async deletePushToken(ctx: RunMutationCtx, token: string) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.pushTokens.deletePushToken, {
      userId,
      token,
    });
  }

  /**
   * Schedule a notification for future delivery.
   *
   * @returns The scheduled notification ID
   */
  async schedule<T>(
    ctx: RunMutationCtx,
    definition: NotificationDefinition<T>,
    args: {
      userId: string;
      data: T;
      scheduledFor: number | Date;
      transactional?: boolean;
      deduplicationKey?: string;
    },
  ): Promise<{ scheduledNotificationId: string }> {
    const data = args.data;
    const scheduledFor =
      args.scheduledFor instanceof Date
        ? args.scheduledFor.getTime()
        : args.scheduledFor;

    // Validate scheduledFor is in the future
    if (scheduledFor <= Date.now()) {
      throw new Error("scheduledFor must be in the future");
    }

    // Render inbox template for storage
    const inboxTemplate = definition.channels.inbox;
    const title = inboxTemplate
      ? inboxTemplate.title(data)
      : definition.event;
    const body = inboxTemplate ? inboxTemplate.body(data) : "";

    const scheduledNotificationId = await ctx.runMutation(
      this.component.scheduled.scheduleNotification,
      {
        userId: args.userId,
        event: definition.event,
        category: definition.category,
        title,
        body,
        data: args.data as unknown,
        channels: definition.channels,
        scheduledFor,
        transactional: args.transactional,
        deduplicationKey: args.deduplicationKey,
      },
    );

    return { scheduledNotificationId };
  }

  /**
   * Cancel a scheduled notification.
   *
   * @returns true if cancelled, false if not found or already processed
   */
  async cancelScheduled(
    ctx: RunMutationCtx,
    scheduledNotificationId: string,
  ): Promise<boolean> {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(
      this.component.scheduled.cancelScheduledNotification,
      {
        id: scheduledNotificationId as any,
        userId,
      },
    );
  }

  /**
   * Get scheduled notifications for the current user.
   */
  async getScheduledNotifications(
    ctx: RunQueryCtx,
    opts?: { status?: "pending" | "processing" | "sent" | "failed" | "cancelled" },
  ) {
    const userId = await this.options.auth(ctx);
    return await ctx.runQuery(
      this.component.scheduled.getScheduledNotifications,
      {
        userId,
        status: opts?.status,
      },
    );
  }

  /**
   * Send a notification through all enabled channels.
   *
   * @returns The notification ID and delivery results for each channel
   */
  async send<T>(
    ctx: RunMutationCtx | RunActionCtx,
    definition: NotificationDefinition<T>,
    args: {
      userId: string;
      data: T;
      transactional?: boolean;
      deduplicationKey?: string;
      deduplicationTtlSeconds?: number;
    },
  ): Promise<SendResult> {
    const data = args.data;
    const deliveries: DeliveryResult[] = [];

    // 1. Check deduplication
    if (args.deduplicationKey) {
      const isDuplicate = await ctx.runQuery(
        this.component.notifications.checkDeduplication,
        { key: args.deduplicationKey },
      );
      if (isDuplicate) {
        throw new Error(
          "Duplicate notification suppressed by deduplication key",
        );
      }
    }

    // 2. Render inbox template and create notification
    const inboxTemplate = definition.channels.inbox;
    const title = inboxTemplate
      ? inboxTemplate.title(data)
      : definition.event;
    const body = inboxTemplate ? inboxTemplate.body(data) : "";

    const notificationId = await ctx.runMutation(
      this.component.notifications.createNotification,
      {
        userId: args.userId,
        event: definition.event,
        title,
        body,
        data: args.data as unknown,
        transactional: args.transactional,
      },
    );

    // 3. Record deduplication key
    if (args.deduplicationKey) {
      await ctx.runMutation(
        this.component.notifications.recordDeduplication,
        {
          key: args.deduplicationKey,
          ttlSeconds: args.deduplicationTtlSeconds ?? 86400,
        },
      );
    }

    // 4. Resolve enabled channels
    const definedChannels = Object.keys(definition.channels);
    let enabledChannels: string[];

    if (args.transactional) {
      enabledChannels = definedChannels;
    } else {
      enabledChannels = await ctx.runQuery(
        this.component.preferences.resolvePreferences,
        {
          userId: args.userId,
          event: definition.event,
          category: definition.category,
          channels: definedChannels,
        },
      );
    }

    // 5. Dispatch to each enabled non-inbox channel
    for (const channel of enabledChannels) {
      if (channel === "inbox") continue;

      const deliveryResult = await this.dispatchChannel(
        ctx,
        channel,
        definition,
        args.userId,
        data,
        notificationId,
      );

      if (deliveryResult) {
        deliveries.push(deliveryResult);
      }
    }

    return { notificationId, deliveries };
  }

  /**
   * Dispatch a notification to a specific channel.
   */
  private async dispatchChannel<T>(
    ctx: RunMutationCtx | RunActionCtx,
    channel: string,
    definition: NotificationDefinition<T>,
    userId: string,
    data: T,
    notificationId: string,
  ): Promise<DeliveryResult | null> {
    let rendered: Record<string, unknown> | undefined;
    let result: DeliveryResult | undefined;

    try {
      if (channel === "email" && definition.channels.email) {
        const emailTemplate = definition.channels.email;
        const emailConfig = this.options.channels?.email;
        const resendClient = this.options.clients?.email;

        // Resolve email address
        const emailResolver = this.options.resolvers?.email;
        if (!emailResolver) {
          throw new Error("Email resolver not configured");
        }
        const toEmail = await emailResolver(ctx as RunMutationCtx, userId);
        if (!toEmail) {
          return {
            channel: "email",
            status: "skipped",
            error: "No email address for user",
          };
        }

        // Support async html rendering (e.g., React Email)
        const html = emailTemplate.html ? await emailTemplate.html(data) : undefined;

        const renderedEmail: RenderedEmail = {
          from: emailTemplate.from ?? emailConfig?.defaultFrom ?? "",
          to: toEmail,
          subject: emailTemplate.subject(data),
          body: emailTemplate.body(data),
          html,
        };

        rendered = renderedEmail;

        if (!renderedEmail.from) {
          throw new Error(
            "No 'from' address configured. Set channels.email.defaultFrom or specify 'from' in the email template.",
          );
        }

        // Dispatch via Resend if client is configured
        if (resendClient) {
          result = await dispatchEmail(
            ctx as RunMutationCtx,
            resendClient,
            renderedEmail,
          );
        } else {
          // Log stub message for development
          console.log(
            `[notifications] email dispatch (no client configured):`,
            renderedEmail,
          );
          result = {
            channel: "email",
            status: "skipped",
            error: "Email client not configured",
          };
        }
      } else if (channel === "push" && definition.channels.push) {
        const pushTemplate = definition.channels.push;
        const pushConfig = this.options.channels?.push;
        const pushClient = this.options.clients?.push;

        const renderedPush: RenderedPush = {
          userId,
          title: pushTemplate.title(data),
          body: pushTemplate.body(data),
          data: pushTemplate.data?.(data),
        };

        rendered = renderedPush;

        // Dispatch via Expo Push Notifications if client is configured
        if (pushClient) {
          result = await dispatchPush(
            ctx as RunMutationCtx,
            pushClient,
            renderedPush,
            pushConfig?.allowUnregisteredTokens ?? true,
          );
        } else {
          console.log(
            `[notifications] push dispatch (no client configured):`,
            renderedPush,
          );
          result = {
            channel: "push",
            status: "skipped",
            error: "Push client not configured",
          };
        }
      } else if (channel === "sms" && definition.channels.sms) {
        const smsTemplate = definition.channels.sms;
        const smsConfig = this.options.channels?.sms;
        const twilioClient = this.options.clients?.sms;

        // Resolve phone number
        const phoneResolver = this.options.resolvers?.phone;
        if (!phoneResolver) {
          throw new Error("Phone resolver not configured");
        }
        const toPhone = await phoneResolver(ctx as RunMutationCtx, userId);
        if (!toPhone) {
          return {
            channel: "sms",
            status: "skipped",
            error: "No phone number for user",
          };
        }

        const renderedSms: RenderedSms = {
          from: smsTemplate.from ?? smsConfig?.defaultFrom ?? "",
          to: toPhone,
          body: smsTemplate.body(data),
        };

        rendered = renderedSms;

        if (!renderedSms.from) {
          throw new Error(
            "No 'from' phone number configured. Set channels.sms.defaultFrom or specify 'from' in the SMS template.",
          );
        }

        // Dispatch via Twilio if client is configured AND we have action context
        if (twilioClient) {
          if (isActionContext(ctx)) {
            result = await dispatchSms(ctx, twilioClient, renderedSms);
          } else {
            // SMS requires action context - schedule via smsDispatchAction if configured
            const smsAction = this.options.smsDispatchAction;
            if (smsAction) {
              await ctx.scheduler.runAfter(0, smsAction, {
                notificationId,
                rendered: renderedSms,
              });
              result = {
                channel: "sms",
                status: "sent",
                error: "Scheduled for async delivery",
              };
            } else {
              console.log(
                `[notifications] SMS requires action context. Configure smsDispatchAction for async delivery.`,
                renderedSms,
              );
              result = {
                channel: "sms",
                status: "skipped",
                error:
                  "SMS requires action context. Configure smsDispatchAction.",
              };
            }
          }
        } else {
          console.log(
            `[notifications] sms dispatch (no client configured):`,
            renderedSms,
          );
          result = {
            channel: "sms",
            status: "skipped",
            error: "SMS client not configured",
          };
        }
      } else {
        // Unknown channel
        return null;
      }

      // Create delivery log entry
      const status =
        result.status === "sent"
          ? "sent"
          : result.status === "skipped"
            ? "pending"
            : "failed";

      await ctx.runMutation(this.component.delivery.createDeliveryLog, {
        notificationId,
        channel,
        status,
        metadata: {
          rendered,
          externalId: result.externalId,
          error: result.error,
        },
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Log the error
      console.error(`[notifications] ${channel} dispatch failed:`, error);

      // Create failed delivery log entry
      await ctx.runMutation(this.component.delivery.createDeliveryLog, {
        notificationId,
        channel,
        status: "failed",
        metadata: {
          rendered,
          error: errorMessage,
        },
      });

      return {
        channel,
        status: "failed",
        error: errorMessage,
      };
    }
  }

  /**
   * Update delivery status for a notification channel.
   * Call this from webhook handlers or after async delivery completes.
   */
  async updateDeliveryStatus(
    ctx: RunMutationCtx,
    args: {
      deliveryLogId: string;
      status: "sent" | "delivered" | "failed";
      error?: string;
      sentAt?: number;
    },
  ) {
    return await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
      deliveryLogId: args.deliveryLogId,
      status: args.status,
      error: args.error,
      sentAt: args.sentAt,
    });
  }

  /**
   * Get delivery logs for a notification.
   */
  async getDeliveryLogs(ctx: RunQueryCtx, notificationId: string) {
    return await ctx.runQuery(this.component.delivery.getDeliveryLogs, {
      notificationId,
    });
  }

  /**
   * Returns pre-built query and mutation functions for direct export.
   *
   * Usage:
   * ```ts
   * export const { list, unreadCount, markRead, markAllRead, archive, getPreferences, updatePreference } = notifications.api();
   * ```
   */
  api() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return {
      /**
       * List notifications for the current user (paginated)
       */
      list: queryGeneric({
        args: {
          limit: v.optional(v.number()),
          cursor: v.optional(v.number()),
        },
        returns: v.object({
          notifications: v.array(v.any()),
          cursor: v.union(v.number(), v.null()),
        }),
        handler: (ctx: RunQueryCtx, args: { limit?: number; cursor?: number }) =>
          self.list(ctx, args),
      }),

      /**
       * Get unread notification count for the current user
       */
      unreadCount: queryGeneric({
        args: {},
        returns: v.number(),
        handler: (ctx: RunQueryCtx) => self.unreadCount(ctx),
      }),

      /**
       * Mark a notification as read
       */
      markRead: mutationGeneric({
        args: { notificationId: v.string() },
        returns: v.null(),
        handler: (ctx: RunMutationCtx, args: { notificationId: string }) =>
          self.markRead(ctx, args.notificationId),
      }),

      /**
       * Mark all notifications as read for the current user
       */
      markAllRead: mutationGeneric({
        args: {},
        returns: v.null(),
        handler: (ctx: RunMutationCtx) => self.markAllRead(ctx),
      }),

      /**
       * Archive a notification
       */
      archive: mutationGeneric({
        args: { notificationId: v.string() },
        returns: v.null(),
        handler: (ctx: RunMutationCtx, args: { notificationId: string }) =>
          self.archive(ctx, args.notificationId),
      }),

      /**
       * Get notification preferences for the current user
       */
      getPreferences: queryGeneric({
        args: {},
        returns: v.array(v.any()),
        handler: (ctx: RunQueryCtx) => self.getPreferences(ctx),
      }),

      /**
       * Update a notification preference
       */
      updatePreference: mutationGeneric({
        args: {
          level: v.union(
            v.literal("global"),
            v.literal("category"),
            v.literal("event"),
          ),
          key: v.optional(v.string()),
          channel: v.string(),
          enabled: v.boolean(),
        },
        returns: v.string(),
        handler: (
          ctx: RunMutationCtx,
          args: {
            level: "global" | "category" | "event";
            key?: string;
            channel: string;
            enabled: boolean;
          },
        ) => self.updatePreference(ctx, args),
      }),

      /**
       * Register a push notification token for the current user
       */
      registerPushToken: mutationGeneric({
        args: {
          token: v.string(),
          platform: v.optional(
            v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
          ),
          deviceId: v.optional(v.string()),
        },
        returns: v.string(),
        handler: (
          ctx: RunMutationCtx,
          args: {
            token: string;
            platform?: "ios" | "android" | "web";
            deviceId?: string;
          },
        ) => self.registerPushToken(ctx, args),
      }),

      /**
       * Get all push tokens for the current user
       */
      getPushTokens: queryGeneric({
        args: {},
        returns: v.array(v.any()),
        handler: (ctx: RunQueryCtx) => self.getPushTokens(ctx),
      }),

      /**
       * Delete a push token for the current user
       */
      deletePushToken: mutationGeneric({
        args: { token: v.string() },
        returns: v.null(),
        handler: (ctx: RunMutationCtx, args: { token: string }) =>
          self.deletePushToken(ctx, args.token),
      }),

      /**
       * Get delivery logs for a notification
       */
      getDeliveryLogs: queryGeneric({
        args: { notificationId: v.string() },
        returns: v.array(v.any()),
        handler: (ctx: RunQueryCtx, args: { notificationId: string }) =>
          self.getDeliveryLogs(ctx, args.notificationId),
      }),
    };
  }
}

export default Notifications;
