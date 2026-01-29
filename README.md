# Convex Notifications

[![npm version](https://badge.fury.io/js/convex-notifications.svg)](https://badge.fury.io/js/convex-notifications)

<!-- START: Include on https://convex.dev/components -->

A full-stack notifications engine for Convex apps. Real-time inbox, multi-channel delivery (push, email, SMS), user preferences, and deduplication — all as a single installable component.

**Features:**

- Real-time inbox with `list`, `unreadCount`, `markRead`, `markAllRead`, `archive`
- Multi-channel delivery: push (Expo), email (Resend), SMS (Twilio)
- `NotificationDefinition<T>` type — define an event in one file (~20 lines)
- 3-level user preferences: global > category > event
- Transactional notifications that bypass preferences
- Idempotency via deduplication keys
- Push token registration passthrough
- React hooks for inbox and preference management
- React Email support for rich email templates

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

### 2. Create your notifications API

```ts
// convex/notifications.ts
import { createNotificationsApi } from "convex-notifications";
import { components } from "./_generated/api";

export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  registerPushToken,
  updatePreferences,
  getPreferences,
} = createNotificationsApi(components.notifications, {
  auth: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
  resolvers: {
    email: async (ctx, userId) => {
      const user = await ctx.db.get(userId);
      return user?.email ?? null;
    },
    phone: async (ctx, userId) => {
      const user = await ctx.db.get(userId);
      return user?.phone ?? null;
    },
    pushToken: async (ctx, userId) => {
      const user = await ctx.db.get(userId);
      return user?.pushToken ?? null;
    },
  },
});
```

### 3. Deploy

```sh
npx convex deploy
```

## Defining Notification Events

Define each event type as a `NotificationDefinition`. Templates receive **only `data`** — the engine resolves user addresses automatically via your configured resolvers.

```ts
// convex/notifications/commentReply.ts
import type { NotificationDefinition } from "convex-notifications";
import { v } from "convex/values";

export const commentReplyNotification: NotificationDefinition<{
  commenterName: string;
  postTitle: string;
}> = {
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
      title: (data) => `New reply`,
      body: (data) => `${data.commenterName} replied on "${data.postTitle}"`,
    },
  },
};
```

## Sending Notifications

Call `.send()` from any mutation or action:

```ts
import { commentReplyNotification } from "./notifications/commentReply";

export const replyToComment = mutation({
  args: { commentId: v.id("comments"), text: v.string() },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);

    await commentReplyNotification.send(ctx, {
      userId: comment.authorId,
      data: {
        commenterName: "Alice",
        postTitle: comment.postTitle,
      },
    });
  },
});
```

### Transactional Notifications

Add `transactional: true` to bypass user preferences (for password resets, security alerts, etc.):

```ts
await passwordResetNotification.send(ctx, {
  userId,
  data: { resetLink },
  transactional: true,
});
```

### Deduplication

Prevent duplicate sends with a deduplication key:

```ts
await notification.send(ctx, {
  userId,
  data,
  deduplicationKey: `comment-reply:${commentId}`,
});
```

## Inbox

### Queries

```ts
// List notifications (paginated)
const results = useQuery(api.notifications.list, {
  limit: 20,
  cursor: null,
});

// Unread count
const count = useQuery(api.notifications.unreadCount);
```

### Mutations

```ts
const markRead = useMutation(api.notifications.markRead);
const markAllRead = useMutation(api.notifications.markAllRead);
const archiveNotification = useMutation(api.notifications.archive);

// Mark single notification as read
await markRead({ notificationId });

// Mark all as read (timestamp-based)
await markAllRead({});

// Archive a notification
await archiveNotification({ notificationId });
```

## Preferences

Users can control which channels are enabled at three levels: global, category, and event. The most specific setting wins.

```ts
// Get current preferences
const prefs = useQuery(api.notifications.getPreferences);

// Update preferences
const update = useMutation(api.notifications.updatePreferences);

// Disable email globally
await update({ level: "global", channel: "email", enabled: false });

// Enable email for a specific category
await update({ level: "category", category: "social", channel: "email", enabled: true });

// Disable push for a specific event
await update({ level: "event", event: "comment.reply", channel: "push", enabled: false });
```

## Push Token Registration

Pass through push tokens to the underlying expo-push-notifications component:

```ts
const registerToken = useMutation(api.notifications.registerPushToken);
await registerToken({ token: expoPushToken });
```

## React Hooks

```ts
import { useNotifications, useUnreadCount, usePreferences } from "convex-notifications/react";

function NotificationBell() {
  const { notifications, loadMore, status } = useNotifications();
  const unreadCount = useUnreadCount();

  return (
    <div>
      <span>({unreadCount})</span>
      {notifications.map((n) => (
        <div key={n._id}>{n.title}</div>
      ))}
      {status === "CanLoadMore" && <button onClick={loadMore}>Load more</button>}
    </div>
  );
}
```

## React Email Support

Use `emailComponent` to render rich emails with React Email:

```ts
import type { NotificationDefinition } from "convex-notifications";

export const welcomeNotification: NotificationDefinition<{ userName: string }> = {
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  channels: {
    email: {
      subject: (data) => `Welcome, ${data.userName}`,
      emailComponent: (data) => <WelcomeEmail userName={data.userName} />,
    },
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => `Thanks for joining.`,
    },
  },
};
```

## API Reference

| Function | Type | Auth | Description |
|---|---|---|---|
| `list` | query | required | Paginated inbox notifications |
| `unreadCount` | query | required | Count of unread notifications |
| `markRead` | mutation | required | Mark a notification as read |
| `markAllRead` | mutation | required | Mark all notifications as read (timestamp-based) |
| `archive` | mutation | required | Archive a notification |
| `registerPushToken` | mutation | required | Register an Expo push token |
| `updatePreferences` | mutation | required | Update channel preferences (global/category/event) |
| `getPreferences` | query | required | Get user's notification preferences |

## Configuration

```ts
interface NotificationsConfig {
  /** Resolve the current user ID from the request context. */
  auth: (ctx: QueryCtx | MutationCtx | ActionCtx) => Promise<string>;

  /** Resolve delivery addresses per channel. Return null to skip the channel. */
  resolvers: {
    email?: (ctx: QueryCtx, userId: string) => Promise<string | null>;
    phone?: (ctx: QueryCtx, userId: string) => Promise<string | null>;
    pushToken?: (ctx: QueryCtx, userId: string) => Promise<string | null>;
  };
}
```

## Architecture

```
User Event (mutation/action)
  │
  └─ createNotification().send(ctx, { userId, data })
       │
       ├─ Create inbox record (always)
       ├─ Check transactional flag
       ├─ Resolve preferences (global → category → event)
       │
       └─ For each enabled channel:
            ├─ Render template with data
            ├─ Resolve address via config resolvers
            └─ Dispatch to child component
                 ├─ expo-push-notifications (push)
                 ├─ resend (email)
                 └─ twilio (SMS)
```

## Troubleshooting

### TypeScript errors after installation

Run codegen to regenerate types:
```sh
npx convex dev
```

### Auth provider mismatch

The `auth` function in `createNotificationsApi()` must match your auth setup. For Convex Auth:
```ts
auth: async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
},
```

For Clerk:
```ts
auth: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
},
```

### Notifications not delivering to a channel

1. Verify the resolver returns a non-null value for that channel
2. Check that user preferences have the channel enabled
3. For transactional notifications, ensure `transactional: true` is set
4. Check the delivery log for error details

<!-- END: Include on https://convex.dev/components -->

## Local Development

```sh
npm i
npm run dev
```

This starts parallel processes for the Convex backend, Vite frontend, and component build watcher. Changes to `src/` trigger automatic rebuilds.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development guide.
