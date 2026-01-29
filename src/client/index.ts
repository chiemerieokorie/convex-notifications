import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { NotificationsConfig, NotificationDefinition } from "./types.js";

export type { NotificationsConfig, NotificationDefinition } from "./types.js";
export type {
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  SmsTemplate,
} from "./types.js";

export function createNotificationsApi(
  component: ComponentApi,
  config: NotificationsConfig,
) {
  return {
    list: queryGeneric({
      args: {
        limit: v.optional(v.number()),
        cursor: v.optional(v.number()),
      },
      returns: v.object({
        notifications: v.array(v.any()),
        cursor: v.union(v.number(), v.null()),
      }),
      handler: async (ctx, args) => {
        const userId = await config.auth(ctx);
        return await ctx.runQuery(component.inbox.list, {
          userId,
          ...args,
        });
      },
    }),

    unreadCount: queryGeneric({
      args: {},
      returns: v.number(),
      handler: async (ctx) => {
        const userId = await config.auth(ctx);
        return await ctx.runQuery(component.inbox.unreadCount, { userId });
      },
    }),

    markRead: mutationGeneric({
      args: { notificationId: v.string() },
      returns: v.null(),
      handler: async (ctx, args) => {
        const userId = await config.auth(ctx);
        return await ctx.runMutation(component.inbox.markRead, {
          userId,
          notificationId: args.notificationId,
        });
      },
    }),

    markAllRead: mutationGeneric({
      args: {},
      returns: v.null(),
      handler: async (ctx) => {
        const userId = await config.auth(ctx);
        return await ctx.runMutation(component.inbox.markAllRead, { userId });
      },
    }),

    archive: mutationGeneric({
      args: { notificationId: v.string() },
      returns: v.null(),
      handler: async (ctx, args) => {
        const userId = await config.auth(ctx);
        return await ctx.runMutation(component.inbox.archive, {
          userId,
          notificationId: args.notificationId,
        });
      },
    }),

    getPreferences: queryGeneric({
      args: {},
      returns: v.array(v.any()),
      handler: async (ctx) => {
        const userId = await config.auth(ctx);
        return await ctx.runQuery(component.preferences.getPreferences, {
          userId,
        });
      },
    }),

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
      handler: async (ctx, args) => {
        const userId = await config.auth(ctx);
        return await ctx.runMutation(component.preferences.updatePreference, {
          userId,
          ...args,
        });
      },
    }),
  };
}

export function createNotification<T>(
  component: ComponentApi,
  definition: NotificationDefinition<T>,
) {
  return {
    send: mutationGeneric({
      args: {
        userId: v.string(),
        data: v.any(),
        transactional: v.optional(v.boolean()),
        deduplicationKey: v.optional(v.string()),
        deduplicationTtlSeconds: v.optional(v.number()),
      },
      returns: v.string(),
      handler: async (ctx, args) => {
        const data = args.data as T;

        // 1. Check deduplication
        if (args.deduplicationKey) {
          const isDuplicate = await ctx.runQuery(
            component.notifications.checkDeduplication,
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
          component.notifications.createNotification,
          {
            userId: args.userId,
            event: definition.event,
            title,
            body,
            data: args.data,
            transactional: args.transactional,
          },
        );

        // 3. Record deduplication key
        if (args.deduplicationKey) {
          await ctx.runMutation(component.notifications.recordDeduplication, {
            key: args.deduplicationKey,
            ttlSeconds: args.deduplicationTtlSeconds ?? 86400,
          });
        }

        // 4. Resolve enabled channels
        const definedChannels = Object.keys(definition.channels);
        let enabledChannels: string[];

        if (args.transactional) {
          enabledChannels = definedChannels;
        } else {
          enabledChannels = await ctx.runQuery(
            component.preferences.resolvePreferences,
            {
              userId: args.userId,
              event: definition.event,
              category: definition.category,
              channels: definedChannels,
            },
          );
        }

        // 5. Dispatch to each enabled non-inbox channel (stub)
        for (const channel of enabledChannels) {
          if (channel === "inbox") continue;

          let rendered: Record<string, string> | undefined;

          if (channel === "email" && definition.channels.email) {
            rendered = {
              subject: definition.channels.email.subject(data),
              body: definition.channels.email.body(data),
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

          await ctx.runMutation(component.delivery.createDeliveryLog, {
            notificationId,
            channel,
            status: "pending" as const,
            metadata: rendered,
          });

          // Stub: real adapters will replace this
          console.log(
            `[notifications] stub dispatch ${channel} → user ${args.userId}:`,
            rendered,
          );
        }

        return notificationId;
      },
    }),
  };
}
