import type {
  Auth,
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import { queryGeneric, mutationGeneric } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { NotificationsOptions, NotificationDefinition } from "./types.js";

export type { NotificationsOptions, NotificationDefinition } from "./types.js";
export type {
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  SmsTemplate,
} from "./types.js";

export class Notifications {
  constructor(
    public component: ComponentApi,
    public options: NotificationsOptions,
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

      let rendered: Record<string, string> | undefined;

      if (channel === "email" && definition.channels.email) {
        const emailTemplate = definition.channels.email;
        const html = emailTemplate.html ? await emailTemplate.html(data) : undefined;
        rendered = {
          subject: emailTemplate.subject(data),
          body: emailTemplate.body(data),
          ...(html && { html }),
        };
      } else if (channel === "push" && definition.channels.push) {
        rendered = {
          title: definition.channels.push.title(data),
          body: definition.channels.push.body(data),
        };
      } else if (channel === "sms" && definition.channels.sms) {
        rendered = {
          body: definition.channels.sms.body(data),
        };
      }

      if (!rendered) continue;

      const deliveryLogId = await ctx.runMutation(
        this.component.delivery.createDeliveryLog,
        {
          notificationId,
          channel,
          status: "pending" as const,
          metadata: rendered,
        },
      );

      // Attempt dispatch and update delivery status
      try {
        // Stub: real adapters will replace this dispatch logic
        console.log(
          `[notifications] stub dispatch ${channel} → user ${args.userId}:`,
          rendered,
        );

        // Update status to "sent" after successful dispatch
        await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
          deliveryLogId,
          status: "sent" as const,
          sentAt: Date.now(),
        });
      } catch (error) {
        // Update status to "failed" if dispatch fails
        await ctx.runMutation(this.component.delivery.updateDeliveryStatus, {
          deliveryLogId,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return notificationId;
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
    };
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
};
