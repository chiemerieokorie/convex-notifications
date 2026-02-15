# API Design Research: convex-notifications

## Executive Summary

This document analyzes the current `convex-notifications` consumer API and proposes a redesigned API based on research into:
- The Convex component ecosystem (`@convex-dev/agent`, `@convex-dev/workflow`, `@convex-dev/rate-limiter`, `@convex-dev/expo-push-notifications`, `@convex-dev/resend`, `@convex-dev/twilio`, `convex-helpers`)
- Industry-leading notification platforms (Novu, Knock, Courier, MagicBell)
- Event-driven architecture best practices

---

## Problems With the Current Design

### 1. Mixed API Patterns Create Confusion

The current API has three different ways to do the same thing:

```ts
// Pattern A: Direct method calls from within mutations/actions
await notifications.send(ctx, definition, args);

// Pattern B: Manually writing wrapper functions
export const sendNotification = mutation({
  handler: (ctx, args) => notifications.send(ctx, definition, args),
});

// Pattern C: Using the api() factory for pre-built exports
export const { list, unreadCount, markRead } = notifications.api();
```

Developers have to understand all three patterns and when to use each one. The `api()` method is convenient but hides the underlying class. Direct method calls require understanding the `Notifications` class. There's no single "recommended" path.

### 2. `createNotification` Is Disconnected From the Client

`createNotification()` produces a definition object, but sending requires passing both the definition and the `Notifications` instance:

```ts
const welcome = createNotification({ event: "user.welcome", ... });
// Later, somewhere else:
await notifications.send(ctx, welcome, { userId, data });
```

The definition and the client are decoupled — the definition doesn't know which `Notifications` instance will dispatch it. This means:
- No way to register all notification events at startup for validation
- No type-safe connection between the definition's data shape and the send call
- Definitions float around as unattached objects

### 3. Monolithic `Notifications` Class (~900 lines)

The class handles inbox queries, preference management, push tokens, sending, scheduling, delivery tracking, and the `api()` factory — all in one. This makes it hard to understand, test, and extend.

### 4. Retry and Fallback Don't Auto-Execute

The cron jobs identify retries and fallbacks that are ready, but don't actually dispatch them. The consumer is expected to poll and handle dispatch themselves. This is incomplete and pushes complexity onto users.

### 5. Scheduled Notifications Skip the Dispatch Pipeline

When a scheduled notification fires, it only creates an inbox record. It doesn't resolve preferences, render templates for other channels, or dispatch to email/push/SMS. The schedule feature is effectively broken for multi-channel delivery.

### 6. SMS Context-Coupling

SMS dispatch requires an action context (for HTTP calls to Twilio). When called from a mutation, the user must pre-configure a `smsDispatchAction` reference. Email and push don't have this requirement, creating an asymmetry.

### 7. No Digest/Batching

Every notification platform (Novu, Knock, Courier) treats digesting/batching as a first-class primitive. Currently there is no way to roll up related notifications (e.g., "5 new comments on your post" instead of 5 separate notifications).

### 8. Opt-Out by Default

When a user has no preferences set, all channels are enabled. This is an opt-out model. Many apps (especially those under GDPR) need opt-in behavior, where channels are disabled by default until the user explicitly enables them.

---

## Developer-Reported Issues (Verified Against Source)

The following bugs and DX issues have been reported by developers using the component. Each has been verified against the actual source code with line references.

### Critical (Security/Data)

#### Issue 1: Webhook signature verification silently skips when secret is missing

**File:** `src/component/webhooks/resend.ts:188-203`

```ts
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
if (webhookSecret) {
  // verify...
}
// If webhookSecret is undefined, execution continues — no verification at all
```

**Impact:** In production, if `RESEND_WEBHOOK_SECRET` isn't set, anyone can POST spoofed events to the webhook endpoint. Malicious actors could mark emails as "delivered" or trigger false bounces.

**Fix in proposed design:** The `registerWebhooks()` helper should throw at registration time if the secret env var is missing. Fail loud, not silent:

```ts
notifications.registerWebhooks(http, {
  resend: { path: "/webhooks/resend", secret: process.env.RESEND_WEBHOOK_SECRET! },
});
// Throws: "RESEND_WEBHOOK_SECRET is required for webhook signature verification"
```

#### Issue 2: `v.any()` used for stored channel data in schema

**Files:** `src/component/schema.ts:11,88-89,127` and `src/component/validators.ts:57,97,118`

```ts
// schema.ts
data: v.optional(v.any()),           // notification data — no validation
channels: v.any(),                    // scheduled notification channels — no validation
rendered: v.any(),                    // retry queue rendered content — no validation

// validators.ts
data: v.optional(v.any()),           // same — no return type safety
channels: v.any(),
rendered: v.any(),
```

**Impact:** Malformed data gets stored silently. The `api().list` function returns `v.array(v.any())` to consumers (issue #4), so TypeScript types are erased at the component boundary.

**Fix in proposed design:** For `data`, use the notification's `dataValidator` at send time (already available) and store a typed JSON blob. For `channels` on `scheduledNotifications`, don't store templates at all — store only `{ event, data }` and re-resolve templates at execution time (also fixes issue #5 from the architecture section). For `rendered` on `retryQueue`, define a proper union validator:

```ts
rendered: v.union(
  v.object({ type: v.literal("email"), from: v.string(), to: v.string(), subject: v.string(), body: v.string(), html: v.optional(v.string()) }),
  v.object({ type: v.literal("push"), userId: v.string(), title: v.string(), body: v.string(), data: v.optional(v.any()) }),
  v.object({ type: v.literal("sms"), from: v.string(), to: v.string(), body: v.string() }),
)
```

#### Issue 3: Multi-tenant deduplication key scoping is conditional

**File:** `src/client/index.ts:393-396`

```ts
const scopedKey = tenantId
  ? `${tenantId}:${args.deduplicationKey}`
  : args.deduplicationKey;
```

**Impact:** In single-tenant apps (no `tenantId`), two different users sending `dedupe: "welcome"` will collide. User B's welcome notification is silently suppressed because user A already claimed the key. This is a data correctness bug.

**Fix in proposed design:** Always scope deduplication keys to the userId:

```ts
const scopedKey = [tenantId, args.userId, args.dedupe].filter(Boolean).join(":");
```

This guarantees deduplication is per-user by default. If the consumer wants cross-user deduplication (rare), they can opt in explicitly.

### High Priority (DX/Type Safety)

#### Issue 4: `api()` return types use `v.any()` instead of proper validators

**File:** `src/client/index.ts:774-776,825,882,901`

```ts
list: queryGeneric({
  returns: v.object({
    page: v.array(v.any()),   // <-- No type information for notification objects
    // ...
  }),
}),
getPreferences: queryGeneric({
  returns: v.array(v.any()),  // <-- No type information for preferences
}),
getPushTokens: queryGeneric({
  returns: v.array(v.any()), // <-- same
}),
getDeliveryLogs: queryGeneric({
  returns: v.array(v.any()), // <-- same
}),
```

**Impact:** Consumers calling these functions from React get zero TypeScript inference. `useQuery(api.notifications.list)` returns `{ page: any[] }`. Developers must manually cast or look up the schema to know what fields exist.

**Fix in proposed design:** Use the validators already defined in `validators.ts`:

```ts
import { notificationValidator, preferenceValidator, deliveryLogValidator } from "../component/validators.js";

list: queryGeneric({
  returns: v.object({
    page: v.array(notificationValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
}),
getPreferences: queryGeneric({
  returns: v.array(preferenceValidator),
}),
```

The internal `inbox.ts` already uses `notificationValidator` for its return type — the `api()` layer just throws it away.

#### Issue 5: Duplicate notification throws instead of returning a status

**File:** `src/client/index.ts:401-405`

```ts
if (isDuplicate) {
  throw new Error(
    "Duplicate notification suppressed by deduplication key",
  );
}
```

**Impact:** Deduplication is an expected outcome, not an error. Forcing try/catch for expected behavior is bad ergonomics. Every `send()` call site needs error handling just to deal with duplicates:

```ts
// What developers have to do today:
try {
  await notifications.send(ctx, event, { userId, data, deduplicationKey: "..." });
} catch (e) {
  if (e.message.includes("Duplicate")) {
    // expected, ignore
  } else {
    throw e; // actual error
  }
}
```

**Fix in proposed design:** Return a result object instead of throwing:

```ts
const result = await notifications.send(ctx, event, { userId, data, dedupe: "..." });
// result: { status: "sent", notificationId: "...", deliveries: [...] }
// or:     { status: "deduplicated", existingNotificationId: "..." }
```

The `SendResult` type becomes a discriminated union:

```ts
type SendResult =
  | { status: "sent"; notificationId: string; deliveries: DeliveryResult[] }
  | { status: "deduplicated"; dedupe: string };
```

#### Issue 6: `GenericCtx` type prevents clean integration with broader context types

**File:** `src/client/types.ts:5-20`

```ts
export type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
  auth: Auth;
};

export type RunMutationCtx = RunQueryCtx & {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
  scheduler: GenericMutationCtx<GenericDataModel>["scheduler"];
};

export type RunActionCtx = {
  runAction: GenericActionCtx<GenericDataModel>["runAction"];
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"];
  auth: Auth;
};
```

**Impact:** When `send()` is called inside a Better Auth callback (like `sendOTP`), the captured `ctx` is a union type that TypeScript can't narrow. The method signature `send(ctx: RunMutationCtx | RunActionCtx, ...)` doesn't help because the union's properties don't overlap cleanly. Developers resort to `as any`.

**Fix in proposed design:** Accept a broader context type that works with any Convex context:

```ts
// Accept anything that has the capabilities we need
export type SendCtx = {
  runMutation: (...args: any[]) => Promise<any>;
  runQuery: (...args: any[]) => Promise<any>;
  scheduler?: { runAfter: (...args: any[]) => Promise<any> };
};
```

Or provide a `requireActionCtx()` helper that narrows the type:

```ts
import { requireActionCtx } from "convex-notifications";
// In a Better Auth callback:
const actionCtx = requireActionCtx(ctx); // Throws descriptive error if not action ctx
await notifications.send(actionCtx, event, args);
```

#### Issue 7: `inbox` template is optional in types but required at runtime

**File:** `src/client/types.ts:185-190` vs `src/client/index.ts:83-86`

```ts
// types.ts — inbox is optional
export type ChannelTemplates<T> = {
  inbox?: InboxTemplate<T>;  // Optional!
  email?: EmailTemplate<T>;
  // ...
};

// index.ts — throws if missing
if (!definition.channels.inbox) {
  throw new Error("Notification definition must include an 'inbox' channel template");
}
```

**Impact:** TypeScript allows you to define a notification without an inbox template. You only discover the error at runtime.

**Fix in proposed design:** Make `inbox` required in the type:

```ts
export type ChannelTemplates<T> = {
  inbox: InboxTemplate<T>;        // Required — always stored
  email?: EmailTemplate<T>;
  push?: PushTemplate<T>;
  sms?: SmsTemplate<T>;
};
```

Simple, catches the error at compile time.

### Medium Priority (Documentation/Performance)

#### Issue 8: SMS dispatch from mutation context is silently async

**File:** `src/client/index.ts:626-654`

```ts
if (twilioClient) {
  if (isActionContext(ctx)) {
    result = await dispatchSms(ctx, twilioClient, renderedSms);
  } else {
    const smsAction = this.options.smsDispatchAction;
    if (smsAction) {
      await ctx.scheduler.runAfter(0, smsAction, { ... });
      result = {
        channel: "sms",
        status: "sent",                          // <-- Misleading! Not actually sent yet
        error: "Scheduled for async delivery",   // <-- "error" field for non-error info
      };
    }
  }
}
```

**Impact:** The `DeliveryResult` says `status: "sent"` when the SMS hasn't actually been sent — it's been scheduled. The "error" field carries informational text ("Scheduled for async delivery"), not an actual error. This is confusing in delivery logs and misleading for consumers checking results.

**Fix in proposed design:** Add a `"queued"` status and remove the fake error:

```ts
type DeliveryResult = {
  channel: string;
  status: "sent" | "queued" | "failed" | "skipped";
  reason?: string;     // Rename "error" to "reason" — covers both skip reasons and queue explanations
  externalId?: string;
};

// SMS from mutation:
result = { channel: "sms", status: "queued", reason: "Dispatched via scheduler (mutation context)" };
```

Better yet, in the proposed design, SMS dispatch is auto-queued internally — the consumer doesn't need to configure `smsDispatchAction` at all. The `Notifications` class handles the mutation→action handoff transparently.

#### Issue 9: `markAllRead()` does O(n) individual patches

**File:** `src/component/inbox.ts:102-138`

```ts
const unread = await q.collect();     // Load ALL unread notifications into memory
const now = Date.now();
for (const n of unread) {
  await ctx.db.patch(n._id, { readAt: now });  // Individual patch per notification

  // Plus: query fallbackQueue per notification, patch each fallback
  const pendingFallbacks = await ctx.db
    .query("fallbackQueue")
    .withIndex("by_notificationId", (q) => q.eq("notificationId", n._id))
    .filter((q) => q.eq(q.field("status"), "pending"))
    .collect();
  for (const fallback of pendingFallbacks) {
    await ctx.db.patch(fallback._id, { status: "cancelled" });
  }
}
```

**Impact:** For a user with 1,000 unread notifications, this does 1,000+ database reads + 1,000+ patches + N fallback queries + N fallback patches — all in a single mutation. Convex functions have time and operation limits. This will fail for power users.

**Fix in proposed design:** Paginate and batch:

```ts
// Process in chunks of 100
export const markAllRead = internalMutation({
  handler: async (ctx, args) => {
    const batchSize = 100;
    const unread = await q.take(batchSize);
    const now = Date.now();

    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });
    }

    // If there are more, schedule a continuation
    if (unread.length === batchSize) {
      await ctx.scheduler.runAfter(0, internal.inbox.markAllRead, args);
    }

    return null;
  },
});
```

This processes 100 at a time, scheduling continuations. Each mutation stays within limits.

#### Issue 10: Preference default is "enabled" for all channels — not configurable

**File:** `src/component/preferences.ts:129-131`

```ts
// 4. Default: enabled
enabled.push(channel);
```

**Impact:** New users with no preference records get notifications on all channels. For health/finance apps under GDPR, this is a compliance risk — users must explicitly opt in to non-essential communications.

**Fix in proposed design:** Pass a `defaultPreference` config from the constructor through to the preference resolution query:

```ts
// Constructor:
new Notifications(component, {
  defaults: { preferences: "opt-in" },
});

// Preference resolution:
if (defaultMode === "opt-in") {
  // No preference record = disabled (user must explicitly enable)
} else {
  // No preference record = enabled (current behavior, user must explicitly disable)
  enabled.push(channel);
}
```

`required: true` events bypass this entirely — they always deliver regardless of opt-in/opt-out mode.

#### Issue 11: No JSDoc on critical methods

**Files:** `src/client/index.ts` — `send()` (line 376), `schedule()` (line 275), `api()` (line 757)

The `send()` method has a one-line JSDoc. It doesn't document:
- What happens when a deduplication key matches (throws — see issue #5)
- Behavior difference between mutation and action context for SMS (see issue #8)
- Whether `transactional: true` bypasses preferences (yes, but not documented)
- What the return value contains and when channels are "skipped" vs "failed"

The `schedule()` method doesn't document:
- That it only creates inbox records (doesn't dispatch to other channels)
- What happens with a past timestamp (throws)
- That `channels: v.any()` serializes templates, so template changes after scheduling won't apply

The `api()` method doesn't document:
- That `auth` from the constructor runs for every exported function
- Which functions are queries vs mutations
- That `list` returns `v.any()` and loses type information

**Fix in proposed design:** JSDoc for every public method, with examples and edge case documentation. The proposed `api({ auth })` separation also makes the auth flow more explicit.

#### Issue 12: Missing exported types for `RenderedEmail`, `RenderedSms`, `RenderedPush`

**File:** `src/client/index.ts:23-26` — imported but not re-exported:

```ts
import {
  type RenderedEmail,
  type RenderedPush,
  type RenderedSms,
} from "./adapters.js";
// These are used internally but NOT in the export block at lines 28-44
```

**File:** `package.json:44-76` — no `"./adapters"` export path exists.

**Impact:** Developers building custom channel adapters or processing webhook data must import from `convex-notifications/dist/client/adapters` (an internal path that can break between versions). The types are available in the codebase but unreachable from the public API.

**Fix in proposed design:** Add to the re-export block:

```ts
export type { RenderedEmail, RenderedPush, RenderedSms } from "./adapters.js";
```

Or, in the redesigned API, export them from the main entry point as part of the public types.

---

## Research: What the Ecosystem Does

### Convex Component Patterns

Every Convex component follows the same pattern: **class constructor takes `(componentApi, options?)`, methods take `ctx` as first parameter**.

| Component | API Style | Key Pattern |
|---|---|---|
| `@convex-dev/agent` | `new Agent(component, config)` | Rich config, method chaining, factory methods for Convex functions |
| `@convex-dev/workflow` | `new WorkflowManager(component, options)` | `define()` returns Convex function refs, `start()`/`status()`/`cancel()` |
| `@convex-dev/rate-limiter` | `new RateLimiter(component, limits)` | Generic `<Limits>` for type-safe named configs |
| `@convex-dev/expo-push-notifications` | `new PushNotifications(component, config?)` | Simple class, consumer wraps with auth |
| `@convex-dev/resend` | `new Resend(component, options?)` | Simple class, consumer wraps with auth |
| `convex-helpers` | `customQuery(query, customCtx(...))` | Function builder factory, context extension |

Key conventions:
- **Auth is the consumer's responsibility** — the Convex docs explicitly say "have the user define their own functions that call into the component"
- **Minimal context types** — methods accept `RunQueryCtx`/`RunMutationCtx` (just the capabilities needed), not full `GenericQueryCtx`
- **Component methods call `ctx.runQuery(this.component.public.fn, args)`** internally
- **Factory methods for client-callable functions** — `api()`, `hookAPI()`, `clientApi()` return Convex function defs for direct export

### Notification Platform Patterns

| Feature | Novu | Knock | Courier | Pattern for Us |
|---|---|---|---|---|
| Definition unit | `workflow()` (code-first) | Workflow (dashboard) | `send()` call | `defineNotification()` |
| Orchestration | Steps in code (`step.email()`, `step.digest()`) | Function steps (batch, branch, delay, fetch) | Automations | Leverage `@convex-dev/workflow` |
| Schema validation | Zod → TypeScript inference | Dashboard-defined | Handlebars vars | Convex validators → inference |
| Preferences | 3-level (workflow > global > per-workflow) | Channel > Category > Workflow | Topic (ON/OFF/REQUIRED) | 3-level (keep current) |
| Transactional | `readOnly: true` on workflow | Override flag | `REQUIRED` topic | `required: true` on event |
| Digest/Batch | `step.digest()` returns accumulated events | Batch step with key | Automation primitive | First-class digest support |
| Actor concept | N/A | Actor excluded from recipients | N/A | `actor` option on send |
| Multi-tenancy | N/A | First-class `tenant` | Brand variations | Keep current tenant support |
| Inbox components | `@novu/react` with hooks | `@knocklabs/react` | `@trycourier/react-*` | Keep `src/react/` |

---

## Proposed API Design

### Design Principles

1. **One obvious way to do things** — eliminate the three-pattern confusion
2. **Follow Convex conventions** — class with `(component, options)`, methods take `ctx`
3. **Definitions are registered, not floating** — the client knows about all notification types
4. **Channels dispatch automatically** — retry, fallback, and scheduling go through the full pipeline
5. **Minimal boilerplate** — defining and sending a notification should be ~10 lines each
6. **Type-safe end-to-end** — from definition to send call to template rendering

### Core API: `Notifications` Class

```ts
import { Notifications } from "convex-notifications";
import { components } from "./_generated/api";

// One instance, created once, used everywhere
export const notifications = new Notifications(components.notifications, {
  // Channels — configure which providers to use
  channels: {
    email: new Resend(components.resend, { apiKey: process.env.RESEND_API_KEY }),
    push: new PushNotifications(components.pushNotifications),
    sms: new Twilio(components.twilio, { ... }),
  },

  // Resolvers — how to look up delivery addresses for a user
  resolvers: {
    email: async (ctx, userId) => {
      const user = await ctx.db.get(userId as Id<"users">);
      return user?.email ?? null;
    },
    phone: async (ctx, userId) => { ... },
  },

  // Defaults
  defaults: {
    preferences: "opt-out", // or "opt-in" for GDPR
  },
});
```

### Defining Notifications

```ts
// convex/notifications/commentReply.ts
export const commentReply = notifications.defineEvent({
  name: "comment.reply",
  category: "social",
  data: v.object({
    commenterName: v.string(),
    commentText: v.string(),
    postTitle: v.string(),
  }),
  channels: {
    inbox: {
      title: (data) => `${data.commenterName} replied to your post`,
      body: (data) => data.commentText,
    },
    email: {
      subject: (data) => `New reply on "${data.postTitle}"`,
      body: (data) => `${data.commenterName} said: ${data.commentText}`,
    },
    push: {
      title: (data) => `New reply`,
      body: (data) => `${data.commenterName}: ${data.commentText}`,
    },
  },
});
```

`defineEvent()` returns a typed handle. The `Notifications` instance tracks all registered events internally.

### Sending Notifications

```ts
// In any mutation or action:
await notifications.send(ctx, commentReply, {
  userId: authorId,
  data: {
    commenterName: "Alice",
    commentText: "Great post!",
    postTitle: "My First Post",
  },
});
```

The send call is type-checked: `data` must match the validator from `defineEvent`. If `commentReply` expects `{ commenterName, commentText, postTitle }`, passing anything else is a type error.

### Sending to Multiple Recipients

```ts
await notifications.sendMany(ctx, commentReply, {
  userIds: [user1, user2, user3],
  data: { ... },
  actor: currentUserId, // Automatically excluded from recipients
});
```

The `actor` pattern (from Knock) prevents "you commented on your own post" notifications.

### Required (Transactional) Notifications

```ts
export const passwordReset = notifications.defineEvent({
  name: "auth.password-reset",
  required: true, // Cannot be opted out of. Bypasses all preferences.
  data: v.object({ resetLink: v.string() }),
  channels: {
    inbox: { ... },
    email: { ... },
  },
});
```

`required: true` is clearer than a `transactional` flag — it communicates the semantics (the user is required to receive this) rather than the implementation detail.

### Exposing Client-Callable Functions

For the React inbox, preferences UI, etc., consumers need to expose Convex queries/mutations that clients can call:

```ts
// convex/notifications.ts — export client-callable functions
export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
} = notifications.api({
  // Auth runs in the consumer's context
  auth: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
});
```

`api()` produces Convex `query`/`mutation` function defs that can be directly exported. Auth is injected here — not in the constructor — because auth is only needed for client-facing endpoints, not for server-side `send()` calls where the server already knows the user.

This separation is intentional:
- **Constructor** configures channels, resolvers, and defaults (server concerns)
- **`api()`** configures auth and produces client-facing functions (client concerns)
- **`send()`** is called from server code where you already have the userId

### React Hooks

```tsx
import { useNotifications, useUnreadCount, usePreferences } from "convex-notifications/react";
import { api } from "../convex/_generated/api";

function NotificationBell() {
  const count = useUnreadCount(api.notifications.unreadCount);
  return <button>{count > 0 && <span>{count}</span>}</button>;
}

function NotificationList() {
  const { notifications, loadMore, isLoading } = useNotifications(
    api.notifications.list,
  );

  return (
    <div>
      {notifications.map((n) => (
        <NotificationItem key={n._id} notification={n} />
      ))}
      {loadMore && <button onClick={loadMore}>Load more</button>}
    </div>
  );
}
```

Hooks take function references (from the `api()` exports), not the `Notifications` class. This is clean — React code only depends on the generated API, not the server-side class.

### Mutation Hooks (New)

```tsx
import { useMarkRead, useMarkAllRead, useArchive } from "convex-notifications/react";

function NotificationItem({ notification }) {
  const markRead = useMarkRead(api.notifications.markRead);

  return (
    <div onClick={() => markRead({ notificationId: notification._id })}>
      {notification.title}
    </div>
  );
}
```

The current design only has query hooks. Adding mutation hooks eliminates the need for consumers to manually call `useMutation()`.

---

## Proposed API: Advanced Features

### Deduplication

```ts
await notifications.send(ctx, commentReply, {
  userId: authorId,
  data: { ... },
  dedupe: `comment-reply:${commentId}`, // Key + TTL window
});
```

`dedupe` is shorter and clearer than `deduplicationKey`. The TTL window is configured globally or per-event.

### Scheduling

```ts
await notifications.schedule(ctx, dailyDigest, {
  userId,
  data: { ... },
  at: Date.now() + 24 * 60 * 60 * 1000, // or: after: "24h"
});

// Cancel a scheduled notification
await notifications.cancel(ctx, scheduledId);
```

Scheduled notifications go through the full dispatch pipeline when they fire — not just inbox creation.

### Digest/Batching (New)

```ts
export const commentDigest = notifications.defineEvent({
  name: "comment.digest",
  category: "social",
  data: v.object({
    commenterName: v.string(),
    commentText: v.string(),
    postId: v.string(),
  }),
  digest: {
    key: (data) => data.postId, // Group by post
    window: "1h",               // Accumulate for 1 hour
  },
  channels: {
    inbox: {
      title: (data, digest) =>
        digest.count === 1
          ? `${data.commenterName} commented on your post`
          : `${digest.count} new comments on your post`,
      body: (data, digest) =>
        digest.count === 1
          ? data.commentText
          : `${data.commenterName} and ${digest.count - 1} others commented`,
    },
    email: {
      subject: (data, digest) => `${digest.count} new comments`,
      body: (data, digest) =>
        digest.events.map((e) => `${e.commenterName}: ${e.commentText}`).join("\n"),
    },
  },
});
```

When digesting is enabled, `send()` accumulates events. After the window closes, templates receive both the latest `data` and a `digest` object with `{ count, events }`. Inspired by Novu's `step.digest()`.

### Delivery Tracking

```ts
const result = await notifications.send(ctx, commentReply, { userId, data });
// result: {
//   notificationId: Id<"notifications">,
//   deliveries: [
//     { channel: "inbox", status: "sent" },
//     { channel: "email", status: "sent", externalId: "re_abc123" },
//     { channel: "push", status: "skipped", reason: "no_token" },
//   ]
// }
```

Every send returns structured delivery results with typed status values and skip reasons.

### Webhook Handlers

```ts
// convex/http.ts
import { httpRouter } from "convex/server";

const http = httpRouter();
notifications.registerWebhooks(http, {
  resend: "/webhooks/resend",
  twilio: "/webhooks/twilio",
});
export default http;
```

One call registers all webhook routes for delivery status updates.

---

## Structural Changes

### Split the Monolithic Class

```
src/client/
  index.ts           → Main Notifications class (construction, defineEvent, send, api)
  inbox.ts           → Inbox query methods (list, unreadCount)
  preferences.ts     → Preference methods (get, update, resolve)
  delivery.ts        → Channel dispatch, retry, fallback logic
  scheduling.ts      → Schedule, cancel, digest accumulation
  types.ts           → All type definitions

src/react/
  index.ts           → Provider + all hooks
  hooks/
    useNotifications.ts
    useUnreadCount.ts
    usePreferences.ts
    useMarkRead.ts    → New mutation hooks
    useArchive.ts     → New mutation hooks
```

The `Notifications` class composes these modules internally. From the consumer's perspective, there's still one class — but the code is maintainable.

### Auth Separation

Current design puts auth in the constructor:
```ts
// Current — auth is in the constructor options
new Notifications(component, { auth: async (ctx) => userId, ... });
```

Proposed design separates auth from construction:
```ts
// New — constructor for server config, api() for client auth
const notifications = new Notifications(component, { channels, resolvers });

// Auth only for client-facing endpoints
export const { list, markRead } = notifications.api({
  auth: async (ctx) => userId,
});

// Server-side send() — no auth needed, you already have the userId
await notifications.send(ctx, event, { userId, data });
```

This is a meaningful separation: server-to-server calls don't need auth middleware. Auth only matters when a client (browser) calls a Convex function.

### Full Dispatch for Scheduled Notifications

Currently, scheduled notifications only create inbox records. The fix:

1. Store only `{ event, data, userId }` in the scheduled table (not rendered templates)
2. When the schedule fires, call the full `send()` pipeline
3. Templates are resolved at execution time (not schedule time)
4. Preferences are checked at execution time

This means if a user changes their preferences between scheduling and firing, the new preferences are respected.

---

## Migration Path

### Phase 0: Critical Fixes (Patch Release — No API Changes)

These can ship immediately as bug fixes without waiting for the redesign:

- **Webhook security**: Throw if `RESEND_WEBHOOK_SECRET` / `TWILIO_WEBHOOK_SECRET` is missing (issue #1)
- **Dedupe scoping**: Always include `userId` in deduplication key scope (issue #3)
- **Make `inbox` required** in `ChannelTemplates<T>` type (issue #7)
- **Export `RenderedEmail`, `RenderedSms`, `RenderedPush`** from main entry point (issue #12)
- **Use proper validators** in `api()` return types instead of `v.any()` (issue #4) — the validators already exist in `validators.ts`
- **Paginate `markAllRead()`** with continuation scheduling (issue #9)

### Phase 1: Restructure (Non-Breaking)

- Split `Notifications` class into modules (inbox, preferences, delivery, scheduling)
- Add `defineEvent()` as an alias for `createNotification()` that registers with the instance
- Keep existing `createNotification()` + `send(definition)` working
- Add mutation hooks to `src/react/`
- Broaden context types for Better Auth compatibility (issue #6)
- Add JSDoc to all public methods (issue #11)

### Phase 2: New Send API

- `send(ctx, eventHandle, args)` instead of `send(ctx, definition, args)`
- Return `{ status: "deduplicated" }` instead of throwing on duplicate (issue #5)
- Add `"queued"` delivery status and rename `error` → `reason` (issue #8)
- Add `sendMany()` with `actor` support
- Add `dedupe` shorthand
- Fix scheduled notifications to use full dispatch pipeline (store `{ event, data }` not templates)

### Phase 3: Advanced Features

- Digest/batching support
- Auto-executing retry and fallback
- Default preference mode (`opt-in` / `opt-out`) (issue #10)
- Webhook registration helper with required secrets
- Replace `v.any()` in schema for `channels` and `rendered` fields (issue #2)
- Auto-queue SMS without requiring `smsDispatchAction` config

### Phase 4: Deprecation

- Deprecate `createNotification()` in favor of `defineEvent()`
- Deprecate `createNotificationsApi()` factory function in favor of `new Notifications()` + `.api()`
- Remove deprecated APIs in next major version

---

## Comparison: Current vs. Proposed

| Aspect | Current | Proposed |
|---|---|---|
| **Setup** | `createNotificationsApi(component, options)` factory | `new Notifications(component, options)` class (matches ecosystem) |
| **Define events** | `createNotification({ ... })` → floating object | `notifications.defineEvent({ ... })` → registered handle |
| **Send** | `notifications.send(ctx, definition, args)` | `notifications.send(ctx, eventHandle, args)` (same, but handle is registered) |
| **Auth** | In constructor (always runs) | In `api()` (only for client-facing functions) |
| **Client functions** | `notifications.api()` returns all | `notifications.api({ auth })` returns all with auth injected |
| **React hooks** | Query hooks only | Query + mutation hooks |
| **Scheduling** | Creates inbox record only | Full dispatch pipeline |
| **Retry/fallback** | Consumer must poll and handle | Auto-dispatched by cron |
| **Digest** | Not supported | `digest: { key, window }` on event definition |
| **Bulk send** | Not supported | `sendMany()` with actor exclusion |
| **Preferences default** | Always opt-out | Configurable `opt-in` / `opt-out` |
| **Deduplication** | `deduplicationKey: string`, throws on duplicate | `dedupe: string`, returns `{ status: "deduplicated" }` |
| **Transactional** | `transactional: true` | `required: true` (clearer intent) |
| **SMS dispatch** | Requires `smsDispatchAction` ref, misleading status | Auto-queued internally, `"queued"` status |
| **Webhooks** | Manual route setup, silent skip without secret | `registerWebhooks()` with required secret, fails loud |
| **Code structure** | Monolithic 900-line class | Composed modules |
| **Schema types** | `v.any()` for data, channels, rendered | Proper validators, typed storage |
| **Return types** | `v.array(v.any())` from `api()` | Uses `notificationValidator` etc. from validators.ts |
| **Inbox required** | Optional in types, throws at runtime | Required in types, compile-time error |
| **Dedupe scoping** | Tenant-only (users can collide) | User+tenant scoped by default |
| **Context types** | Strict union, breaks with Better Auth | Broad `SendCtx`, plus `requireActionCtx()` helper |
| **markAllRead** | O(n) patches, no limit | Paginated batches with continuation scheduling |
| **Exported types** | `RenderedEmail` etc. not exported | All public types exported from main entry |

---

## Open Questions

1. **Should `defineEvent()` enforce unique event names at registration time?** This would catch typos and duplicates early but requires runtime validation.

2. **Should digest windows be Convex cron expressions or simple durations?** Cron expressions are more powerful but harder to use.

3. **Should the `api()` method support per-function auth overrides?** Some functions (like `list`) might need different auth than others (like admin functions).

4. **Should we support React Server Components / Next.js App Router patterns?** The current hooks assume client-side rendering.

5. **Should webhook handlers be registered per-channel or all-at-once?** Per-channel is more flexible; all-at-once is simpler.
