# Architecture Decisions

Key design decisions and the references that informed them.

## 1. Class-based client wrapper (not factory functions)

**Decision**: Use a `Notifications` class instead of `createNotificationsApi()` factory functions.

**Why**: Every official Convex component example uses class-based wrappers. The class holds channel config and provides `.send()`, `.api()`, `.schedule()`, `.cancel()`, `.sendMany()`.

**Pattern**:
```ts
const notifications = new Notifications(components.notifications, {
  channels: { ... },
  resolvers: { ... },
});
```

## 2. `api({ auth })` — auth separated from constructor

**Decision**: Auth is injected via `notifications.api({ auth })`, not in the constructor.

**Why**: The constructor configures infrastructure (channels, resolvers). Auth is only needed for the pre-built query/mutation exports. This separation means:
- `send()` can be called from any context without auth resolution
- Multiple API surfaces can share the same channel config with different auth
- No need to cast contexts when calling from HTTP handlers or scheduled functions

```ts
export const { list, unreadCount, ... } = notifications.api({
  auth: async (ctx) => (await ctx.auth.getUserIdentity())?.subject,
});
```

## 3. `defineEvent<T>()` replaces `createNotification<T>()`

**Decision**: Renamed for clarity. `defineEvent` makes it clear you're defining a type, not creating an instance.

**Why**: `createNotification` implied something was being created in the database. `defineEvent` is declarative — it defines a notification event type with its channels and templates. The actual creation happens in `send()`.

## 4. `required` replaces `transactional`

**Decision**: Renamed `transactional: true` to `required: true` on event definitions.

**Why**: "Transactional" is database terminology. "Required" is clear: this notification is required to be delivered, bypassing user preferences. Set once on the event definition, not per-send.

## 5. `SendResult` discriminated union (not exceptions)

**Decision**: `send()` returns a discriminated union instead of throwing on deduplication.

**Why**: Throwing on dedup forces callers into try/catch for normal flow. The union pattern lets callers branch cleanly:
```ts
const result = await notifications.send(ctx, event, { ... });
if (result.status === "deduplicated") {
  // Handle suppression
}
```

## 6. `dedupe` scoped to userId automatically

**Decision**: Deduplication keys are always prefixed with `userId:`.

**Why**: Without scoping, `dedupe: "comment-reply-123"` would prevent ALL users from getting the notification. With scoping, each user gets their own dedup window. This was a bug in the original API.

## 7. `SendCtx` — broad context types

**Decision**: `send()` accepts `SendCtx = MutationCtx | ActionCtx` with minimal required fields.

**Why**: The original API used Convex's `RunMutationCtx` which forced callers in HTTP handlers and scheduled functions to cast to `any`. The broad type accepts anything with `runMutation` and `runQuery`.

## 8. `DeliveryResult` with `"queued"` status

**Decision**: Added `"queued"` to delivery result statuses alongside `"sent"`, `"failed"`, `"skipped"`.

**Why**: SMS from mutation context is queued via `ctx.scheduler.runAfter()`, not sent synchronously. Reporting `"sent"` was misleading. `"queued"` accurately describes the state.

## 9. `markAllRead` returns `{ marked, hasMore }`

**Decision**: `markAllRead` processes 100 notifications per call and returns a continuation signal.

**Why**: Users with thousands of notifications could timeout a mutation. The batched approach lets the caller schedule continuations if needed, while the common case (< 100 unread) completes in one call.

## 10. `defaultPreferenceMode` — opt-in vs opt-out

**Decision**: Added `defaultPreferenceMode: "opt-in" | "opt-out"` to constructor options.

**Why**: Some apps want channels enabled by default (marketing apps). Others want channels disabled unless the user explicitly enables them (GDPR-conscious apps). This is a runtime config passed to preference resolution, not stored in the schema.

## 11. Webhook secrets required (not optional)

**Decision**: Resend and Twilio webhook handlers return 500 if secrets are not configured.

**Why**: Silently processing unverified webhooks in production is a security risk. Failing loud forces developers to configure secrets before deploying webhooks.

## 12. Scheduled notifications store event + data only

**Decision**: `scheduledNotifications` table stores `{ event, data, userId }` — no rendered templates.

**Why**: Storing rendered templates means template changes don't apply to already-scheduled notifications. By storing only the event reference, the full `send()` pipeline runs when the schedule fires, using the latest templates.

## 13. `sendMany()` with actor exclusion

**Decision**: Added `sendMany()` that accepts `{ userIds, actor, data }`.

**Why**: The most common multi-user notification pattern is "notify everyone except the person who did the action." The `actor` param handles this without the caller filtering the list.

## 14. React mutation hooks

**Decision**: Added `useMarkRead()`, `useMarkAllRead()`, `useArchive()`, `useUpdatePreference()` hooks.

**Why**: The original hooks only provided query subscriptions. For mutations, users had to import `useMutation` from `convex/react` and wire it manually. The new hooks are one-liners.
