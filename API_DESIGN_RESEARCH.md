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

### Phase 1: Restructure (Non-Breaking)

- Split `Notifications` class into modules
- Add `defineEvent()` as an alias for `createNotification()` that registers with the instance
- Keep existing `createNotification()` + `send(definition)` working
- Add mutation hooks to `src/react/`

### Phase 2: New Send API

- `send(ctx, eventHandle, args)` instead of `send(ctx, definition, args)`
- Add `sendMany()` with `actor` support
- Add `dedupe` shorthand
- Fix scheduled notifications to use full dispatch pipeline

### Phase 3: Advanced Features

- Digest/batching support
- Auto-executing retry and fallback
- Default preference mode (`opt-in` / `opt-out`)
- Webhook registration helper

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
| **Deduplication** | `deduplicationKey: string` | `dedupe: string` (shorter) |
| **Transactional** | `transactional: true` | `required: true` (clearer intent) |
| **SMS dispatch** | Requires `smsDispatchAction` ref | Auto-queued internally |
| **Webhooks** | Manual route setup | `registerWebhooks(http, paths)` |
| **Code structure** | Monolithic 900-line class | Composed modules |

---

## Open Questions

1. **Should `defineEvent()` enforce unique event names at registration time?** This would catch typos and duplicates early but requires runtime validation.

2. **Should digest windows be Convex cron expressions or simple durations?** Cron expressions are more powerful but harder to use.

3. **Should the `api()` method support per-function auth overrides?** Some functions (like `list`) might need different auth than others (like admin functions).

4. **Should we support React Server Components / Next.js App Router patterns?** The current hooks assume client-side rendering.

5. **Should webhook handlers be registered per-channel or all-at-once?** Per-channel is more flexible; all-at-once is simpler.
