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
       ├─ createNotificationsApi(components.notifications, { auth, resolvers })
       │    → list, unreadCount, markRead, markAllRead, archive
       │    → registerPushToken, updatePreferences, getPreferences
       │
       └─ createNotification<T>({ event, channels })
            → send(ctx, { data })   ← templates receive only data, NOT userId/to
            → Templates return { title, body } per channel
            → Engine resolves addresses via config resolvers

Component Internals
  src/component/        ← tables, core functions (runs inside component sandbox)
  src/component/channels/ ← channel adapters (email, push, sms)
  src/client/           ← API factory, helpers (runs in consumer's function context)
  src/react/            ← React hooks for inbox + preferences
  src/test.ts           ← Test registration utility
```

### Dispatch Flow

1. Consumer calls `send(ctx, { data })` from a `createNotification()` event
2. Engine creates inbox record (always)
3. Engine checks if notification is transactional — if yes, skip preference check
4. Engine resolves user preferences (3-level: global > category > event)
5. For each enabled channel: render template with `data`, resolve address via config resolvers, dispatch to child component

### Key Tables (src/component/schema.ts)

| Table | Purpose |
|---|---|
| notifications | Inbox records (userId, event, title, body, read, archived) |
| preferences | Per-user channel preferences (global, category, event levels) |
| deduplication | Idempotency keys with TTL |
| deliveryLog | Per-channel delivery status tracking |

## Key Patterns

### Component Registration

```ts
// convex/convex.config.ts (consumer app)
import notifications from "convex-notifications/convex.config.js";
const app = defineApp();
app.use(notifications);
```

### createNotificationsApi() Factory

The consumer creates their API by injecting auth and address resolvers:

```ts
// convex/notifications.ts (consumer app)
import { createNotificationsApi } from "convex-notifications";
import { components } from "./_generated/api";

export const notifications = createNotificationsApi(components.notifications, {
  auth: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
  resolvers: {
    email: async (ctx, userId) => { /* return email string */ },
    phone: async (ctx, userId) => { /* return phone string */ },
    pushToken: async (ctx, userId) => { /* return token string */ },
  },
});

export const { list, unreadCount, markRead, markAllRead, archive } = notifications;
```

### createNotification<T>() Event Factory

Each notification event is defined in a single file (~20 lines). Templates receive **only `data`** — the engine resolves recipients and addresses.

```ts
// convex/notifications/welcome.ts
import { createNotification } from "convex-notifications";
import { v } from "convex/values";

export const welcomeNotification = createNotification({
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  category: "onboarding",
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: (data) => `Thanks for joining. Here's how to get started.`,
    },
    email: {
      subject: (data) => `Welcome to the app, ${data.userName}`,
      body: (data) => `Hi ${data.userName}, ...`,
    },
    push: {
      title: (data) => `Welcome!`,
      body: (data) => `Hey ${data.userName}, check out your dashboard.`,
    },
  },
});
```

Sending:
```ts
await welcomeNotification.send(ctx, {
  userId: "user123",
  data: { userName: "Alice" },
});
```

### 3-Level Preference Hierarchy

Preferences resolve in order: **global > category > event**. The most specific enabled setting wins. Transactional notifications bypass preferences entirely.

### Deduplication

Pass a `deduplicationKey` to prevent duplicate sends within a TTL window:
```ts
await notification.send(ctx, {
  userId,
  data,
  deduplicationKey: `comment-reply:${commentId}`,
});
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

1. Create a file in the consumer's `convex/notifications/` directory
2. Call `createNotification()` with event name, data validator, and channel templates
3. Export the result and call `.send()` from any mutation or action

That's it — one file, ~20 lines. No schema changes, no component modifications.

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
