# Roadmap & Architecture Review

Comprehensive review of `convex-notifications` with concrete solutions informed by industry standards (Knock, Novu, Courier) and patterns from official Convex components (`convex-stripe`, `expo-push-notifications`, `convex-resend`, `convex-twilio`, `convex-workflow`, `convex-helpers`).

---

## Issue 1: Dispatch Runs in Mutations (Critical)

**Problem**: `send()` runs entirely inside mutation context. External HTTP calls (Resend, Twilio, Expo) cannot execute in mutations — they require actions. The current `console.log` stub masks this.

**How other Convex components solve this**:

| Component | Pattern |
|---|---|
| `expo-push-notifications` | Mutation creates record with `awaiting_delivery` state, then a **coordinator mutation** (scheduled via `ctx.scheduler.runAfter(250)`) polls for unsent records and schedules **sender actions** that call `fetch()` to Expo's API |
| `convex-resend` | Client calls `ctx.runMutation(component.lib.sendEmail)` which queues the email, then an internal **workpool action** batches and sends to Resend's API |
| `convex-twilio` | Client calls `ctx.runAction(component.messages.create)` which directly calls Twilio's HTTP API |

**Solution**: Follow the Resend/Expo pattern — mutation-first with scheduled action dispatch.

```
send() [mutation context]
  ├── 1. Create inbox record (mutation ✓)
  ├── 2. Record dedup key (mutation ✓)
  ├── 3. Resolve preferences (query ✓)
  ├── 4. Create deliveryLog entries with status "pending" (mutation ✓)
  └── 5. Schedule dispatch action (ctx.scheduler.runAfter ✓)
            └── dispatchChannels [action context]
                  ├── Resolve address via resolver
                  ├── Call external API (fetch ✓)
                  └── Update deliveryLog status (via internal mutation callback)
```

**Concrete changes needed**:

### a. Add `RunActionCtx` type and accept `ctx.scheduler` in send

```ts
// src/client/index.ts
export type RunMutationCtx = RunQueryCtx & {
  runMutation: <Mutation extends FunctionReference<"mutation", "internal">>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>;
  scheduler: {
    runAfter: (delayMs: number, fn: FunctionReference<"action", "internal">, args: any) => Promise<void>;
  };
};
```

### b. Add an internal action in the component for dispatch

```ts
// src/component/dispatch.ts (NEW)
import { internalAction } from "./_generated/server.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";

export const dispatchChannel = internalAction({
  args: {
    deliveryLogId: v.id("deliveryLog"),
    channel: v.string(),
    address: v.string(),
    rendered: v.any(),
    adapterConfig: v.any(), // API keys, etc.
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Adapter dispatch (Resend, Twilio, Expo) based on channel
      const result = await dispatch(args.channel, args.address, args.rendered, args.adapterConfig);

      await ctx.runMutation(internal.delivery.updateDeliveryStatus, {
        deliveryLogId: args.deliveryLogId,
        status: "sent",
        sentAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.delivery.updateDeliveryStatus, {
        deliveryLogId: args.deliveryLogId,
        status: "failed",
        error: (error as Error).message,
      });
    }
    return null;
  },
});
```

### c. Restructure send() to schedule dispatch

```ts
// In Notifications.send():
// After creating deliveryLog entries...
for (const channel of enabledChannels) {
  if (channel === "inbox") continue;

  const deliveryLogId = await ctx.runMutation(
    this.component.delivery.createDeliveryLog,
    { notificationId, channel, status: "pending", metadata: rendered },
  );

  // Resolve address using consumer-provided resolver
  const resolver = this.options.resolvers?.[channel as keyof typeof this.options.resolvers];
  const address = resolver ? await resolver(ctx, args.userId) : null;
  if (!address) continue;

  // Schedule async dispatch
  await ctx.scheduler.runAfter(0, this.component.dispatch.dispatchChannel, {
    deliveryLogId,
    channel,
    address,
    rendered,
    adapterConfig: this.options.adapters?.[channel],
  });
}
```

---

## Issue 2: `markAllRead` Unbounded Mutation

**Problem**: `markAllRead` collects ALL unread notifications and patches them in a single mutation. Users with thousands of unread notifications will hit the 10-second Convex mutation limit.

**Solution**: Add a `batchSize` limit and return a continuation flag. The client loops.

```ts
// src/component/inbox.ts
export const markAllRead = internalMutation({
  args: {
    userId: v.string(),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    marked: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.batchSize ?? 500;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .take(limit + 1);

    const now = Date.now();
    const batch = unread.slice(0, limit);
    for (const n of batch) {
      await ctx.db.patch(n._id, { readAt: now });
    }
    return { marked: batch.length, hasMore: unread.length > limit };
  },
});

// src/client/index.ts - client loops until done
async markAllRead(ctx: RunMutationCtx) {
  const userId = await this.options.auth(ctx);
  let hasMore = true;
  while (hasMore) {
    const result = await ctx.runMutation(this.component.inbox.markAllRead, {
      userId,
      batchSize: 500,
    });
    hasMore = result.hasMore;
  }
}
```

---

## Issue 3: `list` Uses `.collect()` Then Filters (Inefficient)

**Problem**: `inbox.list` calls `.collect()` (loads ALL notifications) then filters in JS. This defeats the purpose of pagination.

**Solution**: Use Convex's `.take()` with proper index-based cursor pagination and add an `archivedAt` index.

```ts
// Add index to schema:
notifications: defineTable({ ... })
  .index("by_userId", ["userId", "_creationTime"])
  .index("by_userId_unread", ["userId", "readAt"])
  .index("by_userId_active", ["userId", "archivedAt", "_creationTime"]),

// Rewrite list:
export const list = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    notifications: v.array(v.any()),
    cursor: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Use index to filter archived=undefined, with cursor on _creationTime
    let q = ctx.db
      .query("notifications")
      .withIndex("by_userId_active", (q) => {
        let base = q.eq("userId", args.userId).eq("archivedAt", undefined);
        if (args.cursor !== undefined) {
          base = base.lt("_creationTime", args.cursor);
        }
        return base;
      })
      .order("desc")
      .take(limit + 1);

    const results = await q;
    const page = results.slice(0, limit);
    const nextCursor = results.length > limit
      ? page[page.length - 1]._creationTime
      : null;

    return { notifications: page, cursor: nextCursor };
  },
});
```

---

## Issue 4: Semver Contradiction

**Problem**: `package.json` says `1.1.0` but the roadmap says v0.1.0 is current and v1.0.0 is a future "stable release" milestone. Under semver, publishing 1.x means API stability commitment.

**Two options**:

1. **Accept you're at 1.x** (recommended): Treat the API as stable. Roadmap milestones become 1.1, 1.2, 1.3, etc. Breaking changes require a 2.0. This is simpler.

2. **Reset to 0.x**: Publish `0.2.0-alpha.0` with a deprecation notice on 1.x. Messy for existing consumers.

**Recommendation**: Go with option 1. Update the roadmap to use 1.x versioning:

```
v1.2.0 - Dispatch Architecture + Channel Adapters
v1.3.0 - React Hooks + Batching
v1.4.0 - Delivery Reliability
...
```

---

## Issue 5: Webhook Handling Pattern

**Problem**: Webhook handlers for delivery status (Resend events, Twilio callbacks) need HTTP endpoints. The component can't expose HTTP routes — the consumer must.

**How Stripe does it**: A standalone `registerRoutes(http, components.stripe, { webhookPath, events })` function that the consumer calls from their `http.ts`. Internally it creates an `httpActionGeneric` that verifies signatures, processes events, and calls component internals.

**How Twilio does it**: A class method `twilio.registerRoutes(http)` that registers routes for `/message-status` and `/incoming-message`.

**Solution for convex-notifications**: Follow the Stripe pattern (standalone function, more explicit).

```ts
// src/client/webhooks.ts (NEW)
import { httpActionGeneric } from "convex/server";
import type { HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

type DeliveryEventHandlers = {
  "email.delivered"?: (ctx: any, event: any) => Promise<void>;
  "email.bounced"?: (ctx: any, event: any) => Promise<void>;
  "email.complained"?: (ctx: any, event: any) => Promise<void>;
  "sms.delivered"?: (ctx: any, event: any) => Promise<void>;
  "sms.failed"?: (ctx: any, event: any) => Promise<void>;
  "push.delivered"?: (ctx: any, event: any) => Promise<void>;
  "push.failed"?: (ctx: any, event: any) => Promise<void>;
};

export function registerDeliveryWebhooks(
  http: HttpRouter,
  component: ComponentApi,
  options: {
    resend?: {
      path?: string;
      webhookSecret: string;
      events?: DeliveryEventHandlers;
    };
    twilio?: {
      path?: string;
      authToken: string;
      events?: DeliveryEventHandlers;
    };
  },
) {
  if (options.resend) {
    const path = options.resend.path ?? "/notifications/resend/webhook";
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        // 1. Verify Resend webhook signature (svix)
        // 2. Parse event type
        // 3. Map Resend event to deliveryLog status update
        // 4. Call component internal mutation to update status
        // 5. Call consumer's event handler if provided
        const body = await request.json();
        const eventType = body.type; // e.g., "email.delivered"

        // Update delivery log
        await ctx.runMutation(component.delivery.updateDeliveryStatus, {
          deliveryLogId: body.data.tags?.deliveryLogId,
          status: mapResendStatus(eventType),
          sentAt: Date.now(),
        });

        // Call consumer handler
        const handler = options.resend?.events?.[eventType as keyof DeliveryEventHandlers];
        if (handler) await handler(ctx, body);

        return new Response(null, { status: 200 });
      }),
    });
  }

  if (options.twilio) {
    const path = options.twilio.path ?? "/notifications/twilio/status";
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const params = new URLSearchParams(await request.text());
        const status = params.get("MessageStatus");

        await ctx.runMutation(component.delivery.updateDeliveryStatus, {
          deliveryLogId: params.get("deliveryLogId") ?? "",
          status: mapTwilioStatus(status),
        });

        const handler = options.twilio?.events?.[`sms.${status}` as keyof DeliveryEventHandlers];
        if (handler) await handler(ctx, { status, sid: params.get("MessageSid") });

        return new Response(null, { status: 200 });
      }),
    });
  }
}
```

**Consumer usage** (mirrors the Stripe pattern you showed):

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerDeliveryWebhooks } from "convex-notifications";
import { components } from "./_generated/api";

const http = httpRouter();

registerDeliveryWebhooks(http, components.notifications, {
  resend: {
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    events: {
      "email.bounced": async (_ctx, event) => {
        console.log("Email bounced:", event.data.email_id);
      },
    },
  },
  twilio: {
    authToken: process.env.TWILIO_AUTH_TOKEN!,
  },
});

export default http;
```

---

## Issue 6: Missing `actionUrl` on Notifications Schema

**Problem**: Every serious in-app inbox (MagicBell, Knock, Novu) supports click-through / deep linking on notification items. The schema has no field for this.

**Solution**: Add `actionUrl` to the notifications table now, before the API stabilizes further.

```ts
// src/component/schema.ts
notifications: defineTable({
  userId: v.string(),
  event: v.string(),
  title: v.string(),
  body: v.string(),
  data: v.optional(v.any()),
  actionUrl: v.optional(v.string()),  // NEW: click-through URL
  imageUrl: v.optional(v.string()),   // NEW: avatar/icon for inbox item
  readAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  transactional: v.optional(v.boolean()),
})
```

Add to `InboxTemplate`:

```ts
export type InboxTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
  actionUrl?: (data: T) => string;   // NEW
  imageUrl?: (data: T) => string;    // NEW
};
```

---

## Issue 7: Missing Throttling / Rate Limiting

**Problem**: No mechanism to prevent notification fatigue. A runaway loop could spam a user with thousands of notifications.

**How convex-helpers solves this**: `defineRateLimits()` with token bucket algorithm, stored in a `rateLimits` table.

**Solution**: Add the `rateLimits` table to the component schema and integrate `convex-helpers/server/rateLimit` into `send()`.

```ts
// src/component/schema.ts - add table
rateLimits: defineTable({
  name: v.string(),
  key: v.optional(v.string()),
  value: v.number(),
  ts: v.number(),
}).index("name", ["name", "key"]),
```

```ts
// src/client/types.ts - add to NotificationDefinition
export type NotificationDefinition<T> = {
  event: string;
  dataValidator: Validator<T, "required", string>;
  category?: string;
  channels: ChannelTemplates<T>;
  rateLimit?: {
    kind: "token bucket" | "fixed window";
    rate: number;        // max sends
    period: number;      // window in ms
    perUser?: boolean;   // key by userId (default true)
  };
};
```

```ts
// In send(), before creating notification:
if (definition.rateLimit) {
  const key = definition.rateLimit.perUser !== false
    ? `${definition.event}:${args.userId}`
    : definition.event;
  const result = await ctx.runMutation(this.component.rateLimits.check, {
    name: definition.event,
    key,
    rate: definition.rateLimit.rate,
    period: definition.rateLimit.period,
    kind: definition.rateLimit.kind,
  });
  if (!result.ok) {
    throw new Error(`Rate limited. Retry after ${result.retryAt}ms`);
  }
}
```

**Consumer usage**:

```ts
const commentReply = {
  event: "comment.reply",
  dataValidator: v.object({ commentId: v.string() }),
  category: "social",
  rateLimit: {
    kind: "token bucket" as const,
    rate: 10,
    period: 60_000,  // max 10 per minute per user
  },
  channels: { inbox: { ... } },
};
```

---

## Issue 8: Batch-on-Write for Digests

**Problem**: The roadmap plans digests at v0.6.0 without specifying the accumulation strategy. Using workflow journal state will hit the 8 MiB limit. Cron-based scanning (batch-on-read) doesn't scale.

**Solution**: Batch-on-write pattern using a `pendingBatches` table.

```ts
// src/component/schema.ts - add tables
pendingBatches: defineTable({
  batchKey: v.string(),      // e.g., "comment.reply:user123"
  userId: v.string(),
  event: v.string(),
  items: v.array(v.any()),   // accumulated notification data
  windowEndsAt: v.number(),  // when to flush
  flushed: v.boolean(),
}).index("by_batchKey", ["batchKey"])
  .index("by_windowEndsAt_flushed", ["flushed", "windowEndsAt"]),
```

**Flow**:

```
send() with batch config
  ├── Find or create pendingBatch for (event + userId)
  ├── Append data to items array
  ├── If new batch → schedule flush action at windowEndsAt
  └── Return (no immediate notification)

flushBatch [scheduled action]
  ├── Read pendingBatch
  ├── Render batched template: "Alice and 3 others commented"
  ├── Create single inbox notification
  ├── Dispatch to channels
  └── Mark batch as flushed
```

**Consumer usage**:

```ts
const commentReply = {
  event: "comment.reply",
  dataValidator: v.object({ commenterName: v.string() }),
  batch: {
    window: 5 * 60_000,  // 5-minute window
    template: {
      inbox: {
        title: (items) =>
          items.length === 1
            ? `${items[0].commenterName} replied to your comment`
            : `${items[0].commenterName} and ${items.length - 1} others replied`,
        body: (items) => `${items.length} new replies`,
      },
    },
  },
  channels: { inbox: { ... }, email: { ... } },
};
```

This avoids workflow journal size limits entirely — all state lives in the DB.

---

## Issue 9: Channel Adapter Interface

**Problem**: Channel adapters are hardcoded if/else branches in `send()`. Adding a new channel requires modifying core dispatch logic.

**Solution**: Formalize a `ChannelAdapter` interface. Each adapter is a separate module.

```ts
// src/client/adapters/types.ts (NEW)
export interface ChannelAdapter {
  channel: string;
  render(template: any, data: any): Record<string, string>;
  // dispatch happens in action context — returns provider ID
  dispatch(address: string, rendered: Record<string, string>, config: any): Promise<string>;
}
```

```ts
// src/client/adapters/resend.ts (NEW)
import type { ChannelAdapter } from "./types.js";

export class ResendAdapter implements ChannelAdapter {
  channel = "email" as const;

  constructor(private apiKey: string) {}

  render(template: EmailTemplate<any>, data: any) {
    return {
      subject: template.subject(data),
      body: template.body(data),
      ...(template.html ? { html: template.html(data) } : {}),
    };
  }

  async dispatch(address: string, rendered: Record<string, string>, config: any) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: address,
        subject: rendered.subject,
        html: rendered.html ?? rendered.body,
      }),
    });
    const result = await res.json();
    return result.id;
  }
}
```

**Registration**:

```ts
const notifications = new Notifications(components.notifications, {
  auth: getAuthUserId,
  resolvers: { email: resolveEmail },
  adapters: {
    email: new ResendAdapter(process.env.RESEND_API_KEY!),
    push: new ExpoAdapter(process.env.EXPO_ACCESS_TOKEN!),
    sms: new TwilioAdapter({
      accountSid: process.env.TWILIO_SID!,
      authToken: process.env.TWILIO_TOKEN!,
      from: process.env.TWILIO_FROM!,
    }),
  },
});
```

**Alternative**: Follow the `convex-resend` pattern where each adapter is itself a Convex component. The `convex-notifications` component would `app.use(resend)` as a child and delegate. This keeps API keys out of client code and uses the component sandbox. However, it means consumers must install and configure each child component. Both approaches are valid — the adapter approach is simpler, the child component approach is more secure.

---

## Issue 10: Workflow Cancellation

**Problem**: Once a delayed or batched notification is scheduled, there's no way to cancel it. Example: user deletes a comment → the "new comment" notification should be cancelled.

**Solution**: Add a `cancellationKey` to `send()` and a `cancel()` method.

```ts
// src/component/schema.ts - add to deliveryLog or separate table
cancellationKeys: defineTable({
  key: v.string(),
  notificationId: v.id("notifications"),
  scheduledFnId: v.optional(v.string()),  // Convex scheduled function ID
}).index("by_key", ["key"]),
```

```ts
// Client API
await notification.send(ctx, {
  userId,
  data: { commentId: "abc" },
  cancellationKey: `comment-notification:abc`,
});

// Later, if the comment is deleted:
await notifications.cancel(ctx, { key: `comment-notification:abc` });
```

```ts
// In Notifications class
async cancel(ctx: RunMutationCtx, args: { key: string }) {
  await ctx.runMutation(this.component.cancellation.cancelByKey, {
    key: args.key,
  });
}
```

The component's `cancelByKey` mutation marks the notification as cancelled and, if a scheduled function ID is stored, calls `ctx.scheduler.cancel()`.

---

## Issue 11: Quiet Hours / Timezone Support

**Problem**: Listed as "Future" but expected by industry standards.

**Solution**: Store timezone in preferences. Delay dispatch if within quiet hours.

```ts
// src/component/schema.ts - add to preferences or new table
userSettings: defineTable({
  userId: v.string(),
  timezone: v.optional(v.string()),         // "America/New_York"
  quietHoursStart: v.optional(v.number()),  // minutes from midnight (e.g., 1380 = 11pm)
  quietHoursEnd: v.optional(v.number()),    // minutes from midnight (e.g., 480 = 8am)
}).index("by_userId", ["userId"]),
```

In the dispatch action, before sending:

```ts
// Check quiet hours
const settings = await ctx.runQuery(component.userSettings.get, { userId });
if (settings?.quietHoursStart !== undefined && settings?.timezone) {
  const userNow = getCurrentTimeInTimezone(settings.timezone);
  const minutesSinceMidnight = userNow.hours * 60 + userNow.minutes;

  if (isInQuietHours(minutesSinceMidnight, settings.quietHoursStart, settings.quietHoursEnd)) {
    // Reschedule for end of quiet hours
    const delayMs = msUntilQuietHoursEnd(settings);
    await ctx.scheduler.runAfter(delayMs, internal.dispatch.dispatchChannel, args);
    return;
  }
}
```

Non-transactional notifications respect quiet hours. Transactional notifications bypass them (same as preference bypass).

---

## Issue 12: `html?` Missing from EmailTemplate Type

**Problem**: DECISIONS.md says `html?` was added to EmailTemplate, but `src/client/types.ts` doesn't have it.

**Solution**:

```ts
export type EmailTemplate<T> = {
  subject: (data: T) => string;
  body: (data: T) => string;
  html?: (data: T) => string;  // ADD THIS
};
```

And render it in `send()`:

```ts
if (channel === "email" && definition.channels.email) {
  rendered = {
    subject: definition.channels.email.subject(data),
    body: definition.channels.email.body(data),
    ...(definition.channels.email.html
      ? { html: definition.channels.email.html(data) }
      : {}),
  };
}
```

---

## Issue 13: React Hooks Are Too Minimal

**Problem**: The hooks are thin wrappers that don't add much value. No optimistic updates, no mutation hooks, no type safety on the function references.

**Solution**: Add mutation hooks and optimistic updates (following Novu/MagicBell patterns).

```ts
// src/react/index.ts
"use client";
import { useQuery, usePaginatedQuery, useMutation, useConvex } from "convex/react";
import { useCallback, useMemo } from "react";
import type { FunctionReference } from "convex/server";

type QueryRef = FunctionReference<"query", "public">;
type MutationRef = FunctionReference<"mutation", "public">;

export function useNotifications(api: {
  list: QueryRef;
  unreadCount: QueryRef;
  markRead: MutationRef;
  markAllRead: MutationRef;
  archive: MutationRef;
}, opts?: { initialNumItems?: number }) {
  const { results, loadMore, status } = usePaginatedQuery(
    api.list, {}, { initialNumItems: opts?.initialNumItems ?? 20 },
  );
  const unreadCount = useQuery(api.unreadCount, {}) ?? 0;
  const markReadMutation = useMutation(api.markRead);
  const markAllReadMutation = useMutation(api.markAllRead);
  const archiveMutation = useMutation(api.archive);

  return {
    notifications: results,
    loadMore,
    status,
    unreadCount,
    markRead: useCallback(
      (notificationId: string) => markReadMutation({ notificationId }),
      [markReadMutation],
    ),
    markAllRead: useCallback(
      () => markAllReadMutation({}),
      [markAllReadMutation],
    ),
    archive: useCallback(
      (notificationId: string) => archiveMutation({ notificationId }),
      [archiveMutation],
    ),
  };
}

export function usePreferences(api: {
  getPreferences: QueryRef;
  updatePreference: MutationRef;
}) {
  const preferences = useQuery(api.getPreferences, {}) ?? [];
  const updateMutation = useMutation(api.updatePreference);

  return {
    preferences,
    updatePreference: useCallback(
      (args: { level: string; key?: string; channel: string; enabled: boolean }) =>
        updateMutation(args),
      [updateMutation],
    ),
  };
}
```

**Consumer usage**:

```tsx
import { useNotifications, usePreferences } from "convex-notifications/react";
import { api } from "../convex/_generated/api";

function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, archive, loadMore } =
    useNotifications(api.notifications);

  return (
    <div>
      <span>({unreadCount})</span>
      <button onClick={markAllRead}>Mark all read</button>
      {notifications.map((n) => (
        <div key={n._id} onClick={() => markRead(n._id)}>
          {n.title}
          <button onClick={() => archive(n._id)}>Archive</button>
        </div>
      ))}
      <button onClick={() => loadMore(20)}>Load more</button>
    </div>
  );
}
```

---

## Revised Roadmap

Based on all the above, here's a suggested roadmap reorder aligned with industry priorities:

```
v1.2.0 - Dispatch Architecture + Channel Adapters
  - [ ] Mutation → scheduled action split for channel delivery
  - [ ] ChannelAdapter interface (render + dispatch)
  - [ ] Expo push adapter
  - [ ] Resend email adapter (with html support)
  - [ ] Twilio SMS adapter
  - [ ] Fix list() to use proper index pagination
  - [ ] Fix markAllRead batching
  - [ ] Add actionUrl + imageUrl to schema
  - [ ] Add html? to EmailTemplate type
  - [ ] Document mutation→action handoff in DECISIONS.md

v1.3.0 - React Hooks + Webhook Handlers
  - [ ] Full useNotifications hook (list + mutations + unreadCount)
  - [ ] usePreferences hook (read + update)
  - [ ] registerDeliveryWebhooks() for Resend + Twilio status callbacks
  - [ ] Delivery status tracking end-to-end

v1.4.0 - Reliability + Safety
  - [ ] Rate limiting per event per user (token bucket)
  - [ ] Retry via workflow component
  - [ ] Channel fallback chains (push → email after N minutes)
  - [ ] Cancellation keys for pending notifications
  - [ ] Throttling configuration per NotificationDefinition

v1.5.0 - Scheduling + Timezone
  - [ ] Delayed sends (send at future time)
  - [ ] Quiet hours + timezone support
  - [ ] Recurring notifications via crons
  - [ ] Deduplication key cleanup cron

v1.6.0 - Batching + Digests
  - [ ] Batch-on-write notification collapsing (pendingBatches table)
  - [ ] Configurable batch windows
  - [ ] Batched template rendering ("Alice and N others...")
  - [ ] Digest mode (heterogeneous events → periodic summary)

v1.7.0 - Analytics + Admin
  - [ ] Send / delivered / read rate tracking
  - [ ] Admin dashboard hooks

v2.0.0 - If any breaking API changes accumulate
```

---

## Priority Order for Implementation

If working on these immediately, tackle in this order:

1. **Fix list() pagination** — bug, not feature. Currently loads all data into memory.
2. **Fix markAllRead batching** — will fail for power users.
3. **Add html? to EmailTemplate** — documented but not implemented.
4. **Mutation → action dispatch split** — blocks all channel adapter work.
5. **Add actionUrl to schema** — schema changes should happen before API stabilizes.
6. **Channel adapter interface** — unblocks Resend/Expo/Twilio.
7. **Rate limiting** — safety feature, prevents runaway notification loops.
8. **Webhook registration** — needed for delivery status tracking.
9. **React hooks upgrade** — DX improvement, what consumers interact with most.
10. **Batching** — competitive differentiator.
