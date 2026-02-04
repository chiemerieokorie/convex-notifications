import type {
  Auth,
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  Scheduler,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { NotificationsOptions, NotificationDefinition } from "./types.js";
import type {
  RenderedEmail,
  RenderedPush,
  RenderedSms,
} from "../component/channels/index.js";

export type { NotificationsOptions, NotificationDefinition } from "./types.js";
export type {
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  SmsTemplate,
} from "./types.js";

// Re-export channel adapter types for consumers who want to extend or use them
export type {
  ChannelName,
  ChannelConfig,
  DeliveryStatus,
  DispatchResult,
  RenderedEmail,
  RenderedPush,
  RenderedSms,
} from "../component/channels/index.js";

// Type for dispatch functions (resolved after codegen)
type DispatchApi = {
  dispatchEmail: FunctionReference<"mutation", "internal">;
  dispatchPush: FunctionReference<"mutation", "internal">;
  dispatchSms: FunctionReference<"action", "internal">;
};

export class Notifications {
  private dispatch: DispatchApi;

  constructor(
    public component: ComponentApi,
    public options: NotificationsOptions,
  ) {
    // Type assertion for dispatch module (resolved after codegen)
    this.dispatch = (component as ComponentApi & { dispatch: DispatchApi }).dispatch;
  }

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

  async send<T>(
    ctx: RunMutationCtx,
    definition: NotificationDefinition<T>,
    args: {
      userId: string;
      data: T;
      transactional?: boolean;
      deduplicationKey?: string;
      deduplicationTtlSeconds?: number;
    },
  ) {
    const data = args.data;

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
        data: args.data as any,
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

      let rendered: RenderedEmail | RenderedPush | RenderedSms | undefined;

      if (channel === "email" && definition.channels.email) {
        const emailTemplate = definition.channels.email;
        rendered = {
          subject: emailTemplate.subject(data),
          body: emailTemplate.body(data),
          html: emailTemplate.html?.(data),
        } satisfies RenderedEmail;
      } else if (channel === "push" && definition.channels.push) {
        rendered = {
          title: definition.channels.push.title(data),
          body: definition.channels.push.body(data),
        } satisfies RenderedPush;
      } else if (channel === "sms" && definition.channels.sms) {
        rendered = {
          body: definition.channels.sms.body(data),
        } satisfies RenderedSms;
      }

      if (!rendered) continue;

      // Create delivery log entry with pending status
      const deliveryLogId = await ctx.runMutation(
        this.component.delivery.createDeliveryLog,
        {
          notificationId,
          channel,
          status: "pending" as const,
          metadata: rendered,
        },
      );

      // Dispatch via child components
      try {
        if (channel === "email") {
          const emailAddress = await this.options.resolvers?.email?.(ctx, args.userId);
          if (emailAddress) {
            const emailRendered = rendered as RenderedEmail;
            await ctx.runMutation(this.dispatch.dispatchEmail, {
              to: emailAddress,
              subject: emailRendered.subject,
              body: emailRendered.body,
              html: emailRendered.html,
            });
            await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
              deliveryLogId,
              status: "sent" as const,
              sentAt: Date.now(),
            });
          } else {
            console.warn(`[notifications] No email address for user ${args.userId}`);
            await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
              deliveryLogId,
              status: "failed" as const,
              error: "No email address configured",
            });
          }
        } else if (channel === "push") {
          // Push notifications use userId directly (tokens managed by expo-push component)
          const pushRendered = rendered as RenderedPush;
          await ctx.runMutation(this.dispatch.dispatchPush, {
            userId: args.userId,
            title: pushRendered.title,
            body: pushRendered.body,
            data: pushRendered.data,
          });
          await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
            deliveryLogId,
            status: "sent" as const,
            sentAt: Date.now(),
          });
        } else if (channel === "sms") {
          const phoneNumber = await this.options.resolvers?.phone?.(ctx, args.userId);
          if (phoneNumber) {
            const smsRendered = rendered as RenderedSms;
            // SMS requires action context, so we schedule it
            await ctx.scheduler.runAfter(0, this.dispatch.dispatchSms, {
              to: phoneNumber,
              body: smsRendered.body,
            });
            await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
              deliveryLogId,
              status: "sent" as const,
              sentAt: Date.now(),
            });
          } else {
            console.warn(`[notifications] No phone number for user ${args.userId}`);
            await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
              deliveryLogId,
              status: "failed" as const,
              error: "No phone number configured",
            });
          }
        }
      } catch (error) {
        console.error(`[notifications] Dispatch error for ${channel}:`, error);
        await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
          deliveryLogId,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return notificationId;
  }
}

export default Notifications;

// Type utilities

export type RunQueryCtx = {
  runQuery: <Query extends FunctionReference<"query", "internal">>(
    query: Query,
    args: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>;
  auth: Auth;
};

export type RunMutationCtx = RunQueryCtx & {
  runMutation: <Mutation extends FunctionReference<"mutation", "internal">>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>;
  scheduler: Scheduler;
};
