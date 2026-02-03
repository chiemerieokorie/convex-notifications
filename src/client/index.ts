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
   * This delegates to the expo-push-notifications component.
   */
  async registerPushToken(
    ctx: RunMutationCtx,
    args: { userId: string; pushToken: string },
  ) {
    const pushClient = this.options.clients?.push;
    if (!pushClient) {
      throw new Error(
        "Push notifications client not configured. Pass clients.push to Notifications constructor.",
      );
    }
    return await pushClient.recordToken(ctx, args);
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

        const renderedEmail: RenderedEmail = {
          from: emailTemplate.from ?? emailConfig?.defaultFrom ?? "",
          to: toEmail,
          subject: emailTemplate.subject(data),
          body: emailTemplate.body(data),
          html: emailTemplate.html?.(data),
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
}

export default Notifications;
