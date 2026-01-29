# Architecture Decisions

Key design decisions and the references that informed them.

## 1. Class-based client wrapper (not factory functions)

**Decision**: Use a `Notifications` class instead of `createNotificationsApi()` / `createNotification()` factory functions.

**Why**: Every official Convex component example uses class-based wrappers. Factory functions were non-standard and would confuse developers familiar with the ecosystem.

**References**:
- [convex-helpers/server/rateLimit](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/rateLimit.ts) — `RateLimiter` class, constructor takes `(component, options)`
- [expo-push-notifications](https://github.com/get-convex/expo-push-notifications) — class pattern with `ctx` as first method arg
- [convex-stripe](https://github.com/get-convex/convex-stripe) — same class pattern
- [convex-twilio](https://github.com/get-convex/convex-twilio) — same class pattern
- [convex-resend](https://github.com/get-convex/convex-resend) — same class pattern
- [convex-workpool](https://github.com/get-convex/convex-workpool) — same class pattern

**Pattern**:
```ts
const notifications = new Notifications(components.notifications, {
  auth: async (ctx) => (await ctx.auth.getUserIdentity())?.subject,
});
```

## 2. `api()` method for plug-and-play exports

**Decision**: Add an `api()` method that returns pre-built `queryGeneric` / `mutationGeneric` functions, so users can do:

```ts
export const { list, unreadCount, markRead, markAllRead, archive } = notifications.api();
```

**Why**: Without this, users had to write 40+ lines of boilerplate wrapping each method in `queryGeneric`/`mutationGeneric` with args schemas. This was bad DX and error-prone.

**References**:
- [convex-helpers RateLimiter](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/rateLimit.ts) — similar pattern with hook API exports
- [better-auth](https://github.com/better-auth/better-auth) — `auth.api` pattern for pre-built endpoints

## 3. Constructor-level auth (not per-query custom functions)

**Decision**: Auth is resolved once via `options.auth` in the constructor, not via `customQuery`/`customMutation` wrappers from convex-helpers.

**Why**: The component already handles auth globally. Adding convex-helpers custom functions would duplicate auth resolution and add an unnecessary dependency. Users who want custom functions can still wrap the class methods.

**References**:
- All `.examples/` in this repo use constructor-level auth
- [convex-helpers customQuery](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts) — considered but not needed here

## 4. `NotificationDefinition<T>` with channel templates

**Decision**: Notification events are defined as typed objects with per-channel template functions:

```ts
const welcomeDef: NotificationDefinition<{ userName: string }> = {
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  category: "onboarding",
  channels: {
    inbox: { title: (data) => `Welcome, ${data.userName}!`, body: () => "..." },
    email: { subject: (data) => `Welcome ${data.userName}`, body: (data) => "..." },
  },
};
```

**Why**: Templates run in the client mutation context (not inside the component sandbox), so they can use full TypeScript. Each channel has its own shape (email needs subject/body/html, push needs title/body, sms needs body only).

**Trade-off**: More verbose than a flat `(data, to) => payload` pattern, but type-safe per channel and explicit about what each channel renders.

**Alternative considered**: The [asvab notification pattern](https://github.com/chiemerieokorie/crucible-fund) uses flat channel functions returning full payloads `(data, to) => { to, subject, html }`. Simpler but mixes routing (recipient) with rendering (template). May revisit in a future version.

## 5. `html?` on EmailTemplate for React Email

**Decision**: Added optional `html?: (data: T) => string` to `EmailTemplate<T>` instead of creating a separate React Email integration.

**Why**: React Email's `render()` returns a string. Users call `render(<WelcomeEmail name={data.name} />)` in the `html` function. No framework coupling needed — works with any HTML-producing tool.

**References**:
- [React Email render()](https://react.email/docs/utilities/render) — returns string
- [Resend + React Email](https://resend.com/docs/send-with-react-email) — same pattern

This moved React Email support from v0.3.0 to v0.1.0.

## 6. Release gated on tests

**Decision**: GitHub Actions release workflow uses `workflow_run` trigger to only run after the test workflow succeeds.

**Why**: Prevents publishing broken packages to npm. The test workflow runs build, typecheck, lint, and 35 integration tests.

**References**:
- [GitHub Actions workflow_run](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run) — official docs

## 7. Deduplication in client, not component

**Decision**: Deduplication check happens in the `send()` method on the client side (via `ctx.runQuery` to the component), not as internal component logic.

**Why**: Keeps the component generic. The client decides whether to check and what TTL to use. The component just stores and queries dedup keys.

## 8. Preference resolution: 3-level hierarchy

**Decision**: Preferences resolve as global > category > event, with the most specific level winning.

**Why**: Users want global "mute email" but also per-event overrides. Categories group related events (e.g., "social", "onboarding") for batch preference management.

This was originally planned for v0.2.0 but implemented in v0.1.0 since the schema already supported it.

## 9. Rate limiting via `@convex-dev/rate-limiter` child component

**Decision**: Use the `@convex-dev/rate-limiter` Convex component instead of implementing our own token bucket in the component schema.

**Why**: The rate-limiter component is actively maintained, supports sharding for high throughput, and follows the same child-component pattern we already use for planned workflow/crons integration. It owns its own tables in its own sandbox — no schema changes needed in our component.

**References**:
- [@convex-dev/rate-limiter](https://www.convex.dev/components/rate-limiter) — official Convex component
- [convex-helpers/server/rateLimit](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/rateLimit.ts) — legacy helper (considered, not chosen)

## 10. Webhook registration follows `convex-stripe` pattern

**Decision**: Expose a standalone `registerDeliveryWebhooks(http, component, options)` function that consumers call from their `http.ts`, rather than a class method.

**Why**: The component can't expose HTTP routes — the consumer must. The `convex-stripe` `registerRoutes()` pattern is the ecosystem standard. It takes an `HttpRouter`, the component API reference, and per-event handler callbacks.

**References**:
- [convex-stripe registerRoutes](https://github.com/get-convex/convex-stripe) — same pattern
- [convex-twilio registerRoutes](https://github.com/get-convex/convex-twilio) — class method variant (less explicit)

## 11. User settings via consumer resolver, not component table

**Decision**: Quiet hours and timezone are resolved via a `settings` resolver function in `NotificationsOptions.resolvers`, not stored in a component-owned table.

**Why**: User settings (timezone, quiet hours) are inherently consumer data — they belong alongside user profiles, not inside the notification component. The resolver pattern is already used for email/phone/pushToken. Adding a `userSettings` table to the component would duplicate data the consumer already has.

## 12. Batch-on-write for notification collapsing

**Decision**: Use a `pendingBatches` table with scheduled flush rather than workflow journal state or cron-based scanning.

**Why**: Workflow journal has an 8 MiB limit — accumulating thousands of events would hit it. Cron-based batch-on-read requires scanning all unflushed batches every interval, which doesn't scale. Batch-on-write appends to a DB record and schedules a single flush action at window close.

**References**:
- [Knock batch-on-write](https://knock.app/blog/building-a-batched-notification-engine) — same approach
- [NotificationAPI batching](https://www.notificationapi.com/blog/announcing-batching-and-digest) — similar pattern

## 13. Index-based pagination (not `.collect()` + `.filter()`)

**Decision**: Replace `list()` implementation from `.collect()` + `.filter()` to `.withIndex("by_userId_active").take(limit + 1)`.

**Why**: The original implementation loaded ALL notifications into memory, then filtered and sliced. This is O(n) in total notifications, not O(page size). With the `by_userId_active` index on `[userId, archivedAt, _creationTime]`, we can query directly for non-archived notifications with cursor-based pagination.

## 14. Batched `markAllRead` with continuation

**Decision**: `markAllRead` now takes an optional `batchSize` (default 500) and returns `{ marked, hasMore }`. The client loops until `hasMore` is false.

**Why**: The original implementation collected all unread notifications and patched them in a single mutation. With the 10-second Convex mutation limit, a user with thousands of unread notifications would hit timeouts. The batched approach processes 500 at a time.
