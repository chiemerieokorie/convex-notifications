import type {
  Auth,
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import { RateLimiter } from "@convex-dev/rate-limiter";
import type {
  NotificationsOptions,
  NotificationDefinition,
  SendArgs,
  UserSettings,
} from "./types.js";

// Use the generated component API type. After running `npm run build:codegen`,
// the ComponentApi type will include all sub-modules (inbox, notifications,
// preferences, delivery, cancellation, batching, rateLimiter). Before codegen
// runs, we extend the type to include the new modules.
type ComponentApi = {
  inbox: any;
  notifications: any;
  preferences: any;
  delivery: any;
  cancellation: any;
  batching: any;
  rateLimiter: any;
};

export type { NotificationsOptions, NotificationDefinition } from "./types.js";
export type {
  BatchConfig,
  ChannelAdapter,
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  RateLimitConfig,
  RenderedMessage,
  SendArgs,
  SmsTemplate,
  UserSettings,
} from "./types.js";

// --- Quiet hours helper ---

function isInQuietHours(
  settings: UserSettings,
  nowMs: number,
): boolean {
  if (
    settings.quietHoursStart === undefined ||
    settings.quietHoursEnd === undefined ||
    !settings.timezone
  ) {
    return false;
  }

  // Approximate timezone offset — in production, consumers should
  // provide a full resolver. We use UTC minutes-from-midnight here.
  const nowMinutes = Math.floor((nowMs / 60000) % 1440);
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;

  if (start <= end) {
    // Same-day window (e.g. 8am–6pm)
    return nowMinutes >= start && nowMinutes < end;
  }
  // Overnight window (e.g. 11pm–8am)
  return nowMinutes >= start || nowMinutes < end;
}

export class Notifications {
  private rateLimiter: RateLimiter;

  constructor(
    public component: ComponentApi,
    public options: NotificationsOptions,
  ) {
    this.rateLimiter = new RateLimiter(component.rateLimiter, {});
  }

  // --- Inbox queries ---

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

  // --- Inbox mutations ---

  async markRead(ctx: RunMutationCtx, notificationId: string) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.inbox.markRead, {
      userId,
      notificationId,
    });
  }

  async markAllRead(ctx: RunMutationCtx) {
    const userId = await this.options.auth(ctx);
    let hasMore = true;
    let totalMarked = 0;
    while (hasMore) {
      const result = await ctx.runMutation(
        this.component.inbox.markAllRead,
        { userId, batchSize: 500 },
      );
      totalMarked += result.marked;
      hasMore = result.hasMore;
    }
    return totalMarked;
  }

  async archive(ctx: RunMutationCtx, notificationId: string) {
    const userId = await this.options.auth(ctx);
    return await ctx.runMutation(this.component.inbox.archive, {
      userId,
      notificationId,
    });
  }

  // --- Preferences ---

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

  // --- Cancellation ---

  async cancel(ctx: RunMutationCtx, args: { key: string }) {
    return await ctx.runMutation(
      this.component.cancellation.cancelByKey,
      { key: args.key },
    );
  }

  // --- Send ---

  async send<T>(
    ctx: RunMutationCtx,
    definition: NotificationDefinition<T>,
    args: SendArgs<T>,
  ) {
    const data = args.data;
    const isTransactional =
      args.transactional ?? definition.transactional ?? false;

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

    // 2. Rate limiting (via @convex-dev/rate-limiter component)
    if (definition.rateLimit) {
      const { ok, retryAfter } = await this.rateLimiter.limit(
        ctx as any,
        definition.event,
        {
          key: args.userId,
          config: {
            kind: definition.rateLimit.kind,
            rate: definition.rateLimit.rate,
            period: definition.rateLimit.period,
            ...(definition.rateLimit.capacity !== undefined
              ? { capacity: definition.rateLimit.capacity }
              : {}),
          },
        },
      );
      if (!ok) {
        throw new Error(
          `Rate limited for ${definition.event}. Retry after ${retryAfter}ms`,
        );
      }
    }

    // 3. Batching — if configured, accumulate instead of sending immediately
    if (definition.batch && !isTransactional) {
      const batchKey = definition.batch.batchKey(data, args.userId);
      const { isNew } = await ctx.runMutation(
        this.component.batching.getOrCreateBatch,
        {
          batchKey,
          userId: args.userId,
          event: definition.event,
          windowMs: definition.batch.windowMs,
          item: data as any,
        },
      );

      // Record dedup key even for batched notifications
      if (args.deduplicationKey) {
        await ctx.runMutation(
          this.component.notifications.recordDeduplication,
          {
            key: args.deduplicationKey,
            ttlSeconds: args.deduplicationTtlSeconds ?? 86400,
          },
        );
      }

      // The batch will be flushed by a scheduled function or cron
      // Return null to indicate the notification was batched, not sent immediately
      if (!isNew) return null;
      // For new batches, the consumer should schedule a flush
      return null;
    }

    // 4. Quiet hours check (non-transactional only)
    let inQuietHours = false;
    if (!isTransactional && this.options.resolvers?.settings) {
      const settings = await this.options.resolvers.settings(
        ctx,
        args.userId,
      );
      if (settings) {
        inQuietHours = isInQuietHours(settings, Date.now());
      }
    }

    // 5. Render inbox template and create notification
    const inboxTemplate = definition.channels.inbox;
    const title = inboxTemplate
      ? inboxTemplate.title(data)
      : definition.event;
    const body = inboxTemplate ? inboxTemplate.body(data) : "";
    const actionUrl = inboxTemplate?.actionUrl
      ? inboxTemplate.actionUrl(data)
      : undefined;
    const imageUrl = inboxTemplate?.imageUrl
      ? inboxTemplate.imageUrl(data)
      : undefined;

    const notificationId = await ctx.runMutation(
      this.component.notifications.createNotification,
      {
        userId: args.userId,
        event: definition.event,
        title,
        body,
        data: args.data as any,
        actionUrl,
        imageUrl,
        transactional: isTransactional || undefined,
      },
    );

    // 6. Record deduplication key
    if (args.deduplicationKey) {
      await ctx.runMutation(
        this.component.notifications.recordDeduplication,
        {
          key: args.deduplicationKey,
          ttlSeconds: args.deduplicationTtlSeconds ?? 86400,
        },
      );
    }

    // 7. Record cancellation key
    if (args.cancellationKey) {
      await ctx.runMutation(
        this.component.cancellation.storeCancellationKey,
        {
          key: args.cancellationKey,
          notificationId,
        },
      );
    }

    // 8. Resolve enabled channels
    const definedChannels = Object.keys(definition.channels);
    let enabledChannels: string[];

    if (isTransactional) {
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

    // 9. Dispatch to each enabled non-inbox channel
    // Skip external channels during quiet hours (non-transactional)
    for (const channel of enabledChannels) {
      if (channel === "inbox") continue;
      if (inQuietHours && !isTransactional) continue;

      let rendered: Record<string, string> | undefined;

      if (channel === "email" && definition.channels.email) {
        const emailTpl = definition.channels.email;
        rendered = {
          subject: emailTpl.subject(data),
          body: emailTpl.body(data),
          ...(emailTpl.html ? { html: emailTpl.html(data) } : {}),
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

      // Stub: real adapters (Resend, Expo, Twilio) will dispatch via
      // scheduled actions. The delivery log entry is created above so
      // adapters can update status to sent/delivered/failed.
      console.log(
        `[notifications] dispatch ${channel} → user ${args.userId}:`,
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
