# Convex Notifications

[![npm version](https://badge.fury.io/js/convex-notifications.svg)](https://badge.fury.io/js/convex-notifications)

<!-- START: Include on https://convex.dev/components -->

A full-stack notifications engine for Convex apps. Real-time inbox, multi-channel delivery (push, email, SMS), user preferences, and deduplication — all as a single installable component.

**Features:**

- Real-time inbox with `list`, `unreadCount`, `markRead`, `markAllRead`, `archive`
- Multi-channel delivery: push (Expo), email (Resend), SMS (Twilio)
- `defineEvent<T>()` — define a notification in ~15 lines with typed templates
- `send()` works from any context — mutations, actions, HTTP handlers — no casting
- `sendMany()` to notify multiple users at once, with actor exclusion
- `SendResult` discriminated union — dedup returns a value, not an exception
- `required` flag for transactional notifications (OTP, security alerts)
- `api({ auth })` for zero-boilerplate query/mutation exports
- 3-level user preferences: global > category > event
- `opt-in` / `opt-out` default preference modes
- Idempotency via `dedupe` keys (scoped to userId)
- `schedule()` / `cancel()` for future delivery
- Push token registration
- React hooks for inbox, preferences, and mutations
- React Email support for rich HTML emails

Found a bug? Feature request? [File it here](https://github.com/chiemerieokorie/notifications/issues).

## Installation

```sh
npm install convex-notifications
```

Peer dependencies:
```sh
npm install convex react
```

## Quick Start

### 1. Install the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import notifications from "convex-notifications/convex.config.js";

const app = defineApp();
app.use(notifications);
export default app;
```

### 2. Create your notifications client

```ts
// convex/notifications.ts
import { Notifications, defineEvent } from "convex-notifications";
import { components } from "./_generated/api";
import { v } from "convex/values";

// 1. Create client — channel config only, no auth
const notifications = new Notifications(components.notifications, {
  resolvers: {
    email: async (ctx, userId) => {
      const user = await ctx.db.get(userId);
      return user?.email ?? null;
    },
  },
});

// 2. Define events
export const welcomeNotification = defineEvent({
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining.",
    },
    email: {
      subject: (data) => `Welcome, ${data.userName}`,
      body: (data) => `Hi ${data.userName}, welcome aboard!`,
    },
  },
});

// 3. Export API — auth injected here
export const {
  list, unreadCount, markRead, markAllRead, archive,
  getPreferences, updatePreference,
} = notifications.api({
  auth: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
});
```

### 3. Send from any mutation or action

```ts
import { welcomeNotification, notifications } from "./notifications";

export const signUp = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await createUser(ctx, args.name);

    // One line. No wrapper. No casting.
    await notifications.send(ctx, welcomeNotification, {
      userId,
      data: { userName: args.name },
    });
  },
});
```

### 4. Deploy

```sh
npx convex deploy
```

## Defining Events

Use `defineEvent<T>()` to define each event type. Templates receive **only `data`** — the engine resolves addresses via your configured resolvers.

```ts
import { defineEvent } from "convex-notifications";
import { v } from "convex/values";

export const commentReply = defineEvent({
  event: "comment.reply",
  dataValidator: v.object({
    commenterName: v.string(),
    postTitle: v.string(),
  }),
  category: "social",
  channels: {
    inbox: {
      title: (data) => `${data.commenterName} replied`,
      body: (data) => `New reply on "${data.postTitle}"`,
    },
    email: {
      subject: (data) => `${data.commenterName} replied to your comment`,
      body: (data) => `${data.commenterName} replied on "${data.postTitle}".`,
    },
    push: {
      title: () => "New reply",
      body: (data) => `${data.commenterName} replied on "${data.postTitle}"`,
    },
  },
});
```

## Sending Notifications

### Basic send

```ts
const result = await notifications.send(ctx, commentReply, {
  userId: comment.authorId,
  data: { commenterName: "Alice", postTitle: "Hello" },
});

// result is a discriminated union:
if (result.status === "sent") {
  console.log("Created:", result.notificationId);
  console.log("Deliveries:", result.deliveries);
}
```

### Required notifications (OTP, security alerts)

Mark the event definition as `required: true` to bypass user preferences:

```ts
const otpNotification = defineEvent({
  event: "auth.otp",
  dataValidator: v.object({ code: v.string() }),
  required: true, // Always sends, even if user disabled the channel
  channels: { ... },
});
```

### Send to multiple users

```ts
await notifications.sendMany(ctx, commentReply, {
  userIds: [author._id, ...subscribers],
  actor: currentUser._id, // Exclude the sender
  data: { commenterName: "Alice", postTitle: "Hello" },
});
```

### Deduplication

Pass a `dedupe` key. Returns `{ status: "deduplicated" }` instead of throwing:

```ts
const result = await notifications.send(ctx, commentReply, {
  userId,
  data,
  dedupe: `reply:${commentId}`, // Scoped to userId automatically
});

if (result.status === "deduplicated") {
  // Already sent — no error thrown
  console.log("Suppressed:", result.dedupe);
}
```

## Inbox

### Queries

```ts
// List notifications (paginated)
const results = usePaginatedQuery(api.notifications.list, {}, { initialNumItems: 20 });

// Unread count
const count = useQuery(api.notifications.unreadCount, {});
```

### Mutations

```ts
const markRead = useMutation(api.notifications.markRead);
const markAllRead = useMutation(api.notifications.markAllRead);
const archive = useMutation(api.notifications.archive);

await markRead({ notificationId });
await markAllRead({}); // Returns { marked, hasMore }
await archive({ notificationId });
```

## Preferences

Users control which channels are enabled at three levels: global, category, and event. Most specific wins.

```ts
// Disable email globally
await update({ level: "global", channel: "email", enabled: false });

// Enable email for a specific category
await update({ level: "category", key: "social", channel: "email", enabled: true });

// Disable push for a specific event
await update({ level: "event", key: "comment.reply", channel: "push", enabled: false });
```

### Default preference mode

```ts
const notifications = new Notifications(components.notifications, {
  defaultPreferenceMode: "opt-in", // Channels disabled unless user enables
  // defaultPreferenceMode: "opt-out", // Default: channels enabled unless user disables
});
```

## Scheduled Notifications

```ts
// Schedule for future delivery
const { scheduledNotificationId } = await notifications.schedule(ctx, reminder, {
  userId,
  data: { title: "Meeting", message: "In 15 minutes" },
  scheduledFor: Date.now() + 15 * 60 * 1000, // Also accepts Date objects
});

// Cancel
await notifications.cancel(ctx, scheduledNotificationId, userId);
```

## React Hooks

```tsx
import {
  NotificationsProvider,
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useArchive,
  usePreferences,
  useUpdatePreference,
} from "convex-notifications/react";

function App() {
  return (
    <NotificationsProvider api={api.notifications}>
      <NotificationBell />
    </NotificationsProvider>
  );
}

function NotificationBell() {
  const { results, loadMore, status } = useNotifications();
  const count = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const archive = useArchive();

  return (
    <div>
      <span>({count ?? 0})</span>
      <button onClick={() => markAllRead({})}>Mark all read</button>
      {results.map((n) => (
        <div key={n._id}>
          <strong>{n.title}</strong>
          <p>{n.body}</p>
          <button onClick={() => markRead({ notificationId: n._id })}>Read</button>
          <button onClick={() => archive({ notificationId: n._id })}>Archive</button>
        </div>
      ))}
      {status === "CanLoadMore" && <button onClick={() => loadMore(20)}>More</button>}
    </div>
  );
}
```

## React Email Support

Use the `html` field to render rich emails:

```ts
import { render } from "@react-email/components";
import WelcomeEmail from "./emails/WelcomeEmail";

export const welcome = defineEvent({
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining.",
    },
    email: {
      subject: (data) => `Welcome, ${data.userName}`,
      body: (data) => `Plain text fallback for ${data.userName}`,
      html: async (data) => await render(<WelcomeEmail userName={data.userName} />),
    },
  },
});
```

## API Reference

| Function | Type | Auth | Description |
|---|---|---|---|
| `list` | query | required | Paginated inbox notifications |
| `unreadCount` | query | required | Count of unread notifications |
| `markRead` | mutation | required | Mark a notification as read |
| `markAllRead` | mutation | required | Mark all as read (batched, returns `{ marked, hasMore }`) |
| `archive` | mutation | required | Archive a notification |
| `getPreferences` | query | required | Get user's notification preferences |
| `updatePreference` | mutation | required | Update channel preferences (global/category/event) |
| `registerPushToken` | mutation | required | Register an Expo push token |
| `getPushTokens` | query | required | Get user's push tokens |
| `deletePushToken` | mutation | required | Delete a push token |
| `getDeliveryLogs` | query | - | Get delivery logs for a notification |

## Troubleshooting

### TypeScript errors after installation

Run codegen to regenerate types:
```sh
npx convex dev
```

### Notifications not delivering to a channel

1. Verify the resolver returns a non-null value for that channel
2. Check that user preferences have the channel enabled
3. For required notifications, ensure `required: true` is set on the event definition
4. Check delivery logs for error details

<!-- END: Include on https://convex.dev/components -->

## Local Development

```sh
npm i
npm run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development guide.
