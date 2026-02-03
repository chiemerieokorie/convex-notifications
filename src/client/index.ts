import type {
  Auth,
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
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

    // 5. Dispatch to each enabled non-inbox channel (stub)
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

      await ctx.runMutation(this.component.delivery.createDeliveryLog, {
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
