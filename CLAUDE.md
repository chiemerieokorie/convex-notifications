# CLAUDE.md

Development guide for `convex-notifications` — a hybrid Convex component that composes expo-push-notifications, resend, twilio, workflow, and crons child components into a unified notifications engine.

## Project Overview

This is a **Convex component** (not a standalone app). It is installed into consumer apps via `app.use(notifications)` in their `convex.config.ts`. The component owns its own tables and exposes functions through a client API factory.

### Child Components

| Component | Purpose |
|---|---|
| expo-push-notifications | Mobile push delivery |
| resend | Email delivery |
| twilio | SMS delivery |
| workflow | Retry and multi-step delivery flows |
| crons | Scheduled and recurring notifications |

## Development Commands

```sh
npm run dev            # Parallel: backend + frontend + build watcher
npm run test           # Vitest (edge-runtime) with typecheck
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run build          # TypeScript compilation
npm run build:codegen  # Convex codegen + build
npm run lint           # ESLint
npm run typecheck      # Check main + example + example/convex
npm run alpha          # Publish prerelease to @alpha tag
npm run release        # Publish patch to latest tag
```

Always run codegen after changing component schemas or function signatures:
```sh
npm run build:codegen
```

## Architecture

```
Consumer App
  └─ convex.config.ts ─── app.use(notifications)
       │
       ├─ new Notifications(components.notifications, { channels, resolvers })
       │    → Constructor: channel config + resolvers only, NO auth
       │
       ├─ notifications.api({ auth })
       │    → Auth injected here (separation of concerns)
       │    → Returns: list, unreadCount, markRead, markAllRead, archive
       │    → Returns: getPreferences, updatePreference
       │    → Returns: registerPushToken, getPushTokens, deletePushToken
       │    → Returns: getDeliveryLogs
       │
       ├─ defineEvent<T>({ event, channels, required?, category? })
       │    → One per notification type (~15 lines)
       │    → Templates receive only `data`, NOT userId/addresses
       │    → inbox channel is required (compile-time)
       │
       └─ notifications.send(ctx, eventDef, { userId, data })
            → Works from mutations, actions, HTTP — no casting
            → Returns SendResult discriminated union
            → Engine resolves addresses via config resolvers

Component Internals
  src/component/        ← tables, core functions (runs inside component sandbox)
  src/component/channels/ ← channel adapters (email, push, sms)
  src/client/           ← Notifications class, defineEvent(), types
  src/react/            ← React hooks for inbox, preferences, mutations
  src/test.ts           ← Test registration utility
```

### Dispatch Flow

1. Consumer calls `notifications.send(ctx, eventDef, { userId, data })`
2. Engine creates inbox record (always — inbox is required on every event)
3. Engine checks if event definition has `required: true` — if yes, skip preference check
4. Engine resolves user preferences (3-level: global > category > event) with `defaultPreferenceMode`
5. For each enabled channel: render template with `data`, resolve address via config resolvers, dispatch to child component
6. Returns `SendResult`: `{ status: "sent", notificationId, deliveries }` or `{ status: "deduplicated", dedupe }`

### Key Tables (src/component/schema.ts)

| Table | Purpose |
|---|---|
| notifications | Inbox records (userId, event, title, body, read, archived, required) |
| preferences | Per-user channel preferences (global, category, event levels) |
| deduplication | Idempotency keys with TTL |
| deliveryLog | Per-channel delivery status tracking (includes "queued" status) |
| scheduledNotifications | Stores event+data only (no stale rendered templates) |
| pushTokens | Push token registration per user |

## Key Patterns

### Component Registration

```ts
// convex/convex.config.ts (consumer app)
import notifications from "convex-notifications/convex.config.js";
const app = defineApp();
app.use(notifications);
```

### Notifications Constructor + api()

Auth is separated from channel config. Constructor takes channels/resolvers; `api()` injects auth:

```ts
// convex/notifications.ts (consumer app)
import { Notifications, defineEvent } from "convex-notifications";
import { components } from "./_generated/api";

// 1. Constructor — channel config + resolvers, no auth
const notifications = new Notifications(components.notifications, {
  resolvers: {
    email: async (ctx, userId) => { /* return email string or null */ },
    phone: async (ctx, userId) => { /* return phone string or null */ },
  },
  defaultPreferenceMode: "opt-out", // or "opt-in"
});

// 2. api() — auth injected here
export const {
  list, unreadCount, markRead, markAllRead, archive,
  getPreferences, updatePreference,
  registerPushToken, getPushTokens, deletePushToken,
  getDeliveryLogs,
} = notifications.api({
  auth: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
});
```

### defineEvent<T>() — Event Definitions

Each notification event is defined with `defineEvent()`. Templates receive **only `data`** — the engine resolves recipients and addresses.

```ts
import { defineEvent } from "convex-notifications";
import { v } from "convex/values";

export const welcomeNotification = defineEvent({
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  category: "onboarding",
  channels: {
    inbox: {  // Required on every event
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining.",
    },
    email: {
      subject: (data) => `Welcome, ${data.userName}`,
      body: (data) => `Hi ${data.userName}, welcome!`,
      html: (data) => `<h1>Welcome, ${data.userName}!</h1>`, // optional
    },
  },
});
```

### Sending Notifications

`send()` works from any context (mutations, actions, HTTP handlers) without casting:

```ts
// Returns a discriminated union — no exceptions for dedup
const result = await notifications.send(ctx, welcomeNotification, {
  userId,
  data: { userName: "Alice" },
  dedupe: `welcome:${userId}`, // auto-scoped to userId
});

if (result.status === "sent") {
  console.log(result.notificationId, result.deliveries);
} else {
  console.log("Suppressed:", result.dedupe);
}
```

### sendMany() with Actor Exclusion

```ts
await notifications.sendMany(ctx, commentReplyNotification, {
  userIds: subscribers,
  actor: currentUser._id, // excluded from recipients
  data: { commenterName: "Alice", postTitle: "Hello" },
});
```

### Required Notifications

Set `required: true` on the event definition (not per-send) to bypass preferences:

```ts
const otpNotification = defineEvent({
  event: "auth.otp",
  required: true, // Always sends, bypasses all preferences
  dataValidator: v.object({ code: v.string() }),
  channels: { inbox: { ... }, sms: { ... } },
});
```

### 3-Level Preference Hierarchy

Preferences resolve in order: **global > category > event**. The most specific enabled setting wins. `required` notifications bypass preferences entirely. Default mode (`"opt-in"` or `"opt-out"`) controls what happens when no preference is set.

### Deduplication

Pass a `dedupe` key. Returns `{ status: "deduplicated" }` instead of throwing:
```ts
const result = await notifications.send(ctx, event, {
  userId,
  data,
  dedupe: `reply:${commentId}`, // auto-scoped to userId
});
// result.status === "deduplicated" | "sent"
```

### markAllRead — Batched

Returns `{ marked, hasMore }` with batch processing (100 per call):
```ts
const { marked, hasMore } = await markAllRead({});
```

## React Hooks

The react package exports query hooks and mutation hooks:

```tsx
import {
  NotificationsProvider,
  useNotifications, useUnreadCount, usePreferences,
  useMarkRead, useMarkAllRead, useArchive, useUpdatePreference,
  useRegisterPushToken, useDeletePushToken, usePushTokens,
  useDeliveryLogs,
} from "convex-notifications/react";
```

## Testing

Tests use **Vitest** with **convex-test** in edge-runtime environment. Test files are colocated with source:

```
src/component/channels/channels.test.ts  # Channel adapter unit tests
src/client/index.test.ts                  # Client API integration tests
example/convex/example.test.ts            # Example app tests
```

Each test directory has a `setup.test.ts` that initializes `convexTest()` and registers the component. Always use `vi.useFakeTimers()` for deterministic tests.

```ts
import { test, expect, vi } from "vitest";
import { initConvexTest } from "./setup.test";

test("creates notification", async () => {
  vi.useFakeTimers();
  const t = initConvexTest();
  // ... test logic
});
```

## Convex Best Practices

These rules apply to all code in this component:

- **Always** use `args` and `returns` validators on every function
- Use `v.null()` for null values (never `undefined` in validators)
- Use `v.int64()` for BigInt values
- **Never** use `.filter()` without a preceding index query — always define indexes
- Use `internalQuery`/`internalMutation` for component-to-component calls
- Separate public API functions from internal implementation
- Use `schema.tables.tableName.validator` to derive return types
- Extend validators with `_id` and `_creationTime` for complete return types

## How to Add a New Notification Event

1. Call `defineEvent()` with event name, data validator, category, and channel templates
2. Export the result and call `notifications.send(ctx, eventDef, { userId, data })` from any mutation or action

That's it — one call, ~15 lines. No schema changes, no component modifications.

## How to Add a New Channel

1. Create an adapter file in `src/component/channels/` (e.g., `slack.ts`)
2. Implement the `ChannelAdapter` interface with `name` and `dispatch(address, content)` method
3. Add the rendered content type to `types.ts` (e.g., `RenderedSlack`)
4. Register the adapter in `dispatcher.ts` and update `ChannelContent` type
5. Export from `src/component/channels/index.ts`
6. Add a resolver type to `NotificationsOptions` in `src/client/types.ts`
7. Add template type to `ChannelTemplates` in `src/client/types.ts`
8. Update the `send()` method in `src/client/index.ts` to render and dispatch
9. Run `npm run build:codegen`
10. Add tests in `src/component/channels/channels.test.ts`

## Documentation Maintenance

When modifying the component:

- [ ] Update README.md API Reference table if functions change
- [ ] Update CHANGELOG.md with the change
- [ ] Update ROADMAP.md if a milestone is completed
- [ ] Update this file if architecture or patterns change
- [ ] Ensure example app demonstrates new features
