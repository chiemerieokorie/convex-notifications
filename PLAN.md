# Implementation Plan: Full API Redesign

Complete redesign and reimplementation of the `convex-notifications` consumer API. No backward compatibility, no deprecation — clean break.

---

## Step 1: Fix the type foundation (`src/client/types.ts`)

Rewrite all type definitions:

- **Make `inbox` required** in `ChannelTemplates<T>` (fixes issue #7 — compile-time not runtime)
- **Rename `transactional` → `required`** on event definitions (clearer intent)
- **Rename `deduplicationKey` → `dedupe`** (shorter)
- **Rename `error` → `reason`** on `DeliveryResult` (covers non-error cases)
- **Add `"queued"` status** to `DeliveryResult` (fixes issue #8)
- **Make `SendResult` a discriminated union** (fixes issue #5):
  ```ts
  type SendResult =
    | { status: "sent"; notificationId: string; deliveries: DeliveryResult[] }
    | { status: "deduplicated"; dedupe: string }
  ```
- **Broaden context types** (fixes issue #6):
  ```ts
  type SendCtx = {
    runMutation: (...args: any[]) => Promise<any>;
    runQuery: (...args: any[]) => Promise<any>;
    scheduler?: { runAfter: (...args: any[]) => Promise<any> };
  };
  ```
- **Add `EventHandle<T>`** type — returned by `defineEvent()`, carries the data type + event name
- **Add `defaults.preferences: "opt-in" | "opt-out"`** to `NotificationsOptions`
- **Remove `smsDispatchAction`** from options (SMS auto-queued internally)
- **Move `auth` out of constructor** into `api()` parameter
- **Export `RenderedEmail`, `RenderedPush`, `RenderedSms`** from public API (fixes issue #12)

**Files:** `src/client/types.ts`

## Step 2: Fix the component schema and validators

- **Replace `v.any()` for `channels`** on `scheduledNotifications` — store only `{ event, data }` reference instead of serialized templates (fixes issue #2)
- **Replace `v.any()` for `rendered`** on `retryQueue` — proper union validator per channel type
- **Keep `v.any()` for `data`** on `notifications` (user-defined shape, can't validate generically inside component) but document why
- **Add `defaultPreferenceMode`** field concept — the component receives this from the client at query time, not stored in schema
- **Update all validators** in `validators.ts` to match schema changes
- **Remove `channels: v.any()`** from `scheduledNotifications` table

**Files:** `src/component/schema.ts`, `src/component/validators.ts`

## Step 3: Fix component internals — preferences

- **Add `defaultMode` parameter** to `resolvePreferences()` — passed from client, controls whether missing preference = enabled or disabled (fixes issue #10)
- No schema change needed — the default mode is a runtime config, not stored data

**Files:** `src/component/preferences.ts`

## Step 4: Fix component internals — inbox

- **Paginate `markAllRead()`** with continuation scheduling (fixes issue #9):
  - Process 100 notifications per mutation call
  - If more remain, schedule continuation via `ctx.scheduler.runAfter(0, ...)`
  - Return immediately to caller (first batch is synchronous)
- **Separate fallback cancellation** from markAllRead — the fallback loop is what makes it slow. Cancel fallbacks in the scheduled continuation, not inline.

**Files:** `src/component/inbox.ts`

## Step 5: Fix component internals — scheduled notifications

- **Rewrite `processScheduledNotifications`** — instead of creating inbox-only records, store enough data for the client to re-run the full `send()` pipeline
- **Remove template storage** — scheduled notifications now store `{ event, data, userId, tenantId }` only
- **Add `dispatchScheduled` internal mutation** that the client can call from cron processing to trigger full send

**Files:** `src/component/scheduled.ts`, `src/component/notifications.ts`

## Step 6: Fix component internals — webhooks

- **Fail loud when secret is missing** (fixes issue #1):
  - Resend webhook: return 500 with "RESEND_WEBHOOK_SECRET not configured" if env var missing
  - Twilio webhook: same pattern with TWILIO_AUTH_TOKEN
  - Log error to console as well
- Do NOT silently proceed without verification

**Files:** `src/component/webhooks/resend.ts`, `src/component/webhooks/twilio.ts`

## Step 7: Rewrite the main `Notifications` class (`src/client/index.ts`)

This is the biggest change. Rewrite the class with these changes:

### Constructor
- Accept `(component, options)` where options has `channels`, `resolvers`, `defaults` — but NOT `auth`
- `auth` moves to `api()` (separation of concerns)

### `defineEvent<T>()`
- New method. Returns an `EventHandle<T>` that is tracked by the instance
- Replaces standalone `createNotification()`
- Enforces unique event names at registration time
- Type carries `T` through to `send()`

### `send<T>()`
- Accept `SendCtx` (broad context type, fixes issue #6)
- **Return discriminated union** instead of throwing on dedup (fixes issue #5)
- **Scope dedupe keys to userId** always (fixes issue #3)
- **Auto-queue SMS** from mutation context via `ctx.scheduler.runAfter()` without requiring `smsDispatchAction` config (fixes issue #8)
- Report `"queued"` status for async SMS instead of misleading `"sent"` + fake error

### `sendMany<T>()`
- New method. Sends to multiple users in one call
- `actor` option excludes the triggering user (Knock pattern)
- Loops `send()` internally per user

### `schedule<T>()`
- Store `{ event, data, userId }` not rendered templates
- Full dispatch pipeline when schedule fires

### `cancel()`
- Renamed from `cancelScheduled()` for brevity

### `api({ auth })`
- Auth injected here, not constructor
- **Use proper validators** for all return types (fixes issue #4):
  - `list` → `v.array(notificationValidator)` instead of `v.array(v.any())`
  - `getPreferences` → `v.array(preferenceValidator)`
  - `getPushTokens` → proper validator
  - `getDeliveryLogs` → `v.array(deliveryLogValidator)`
- Pass `defaults.preferences` mode through to preference resolution

### `registerWebhooks(http, config)`
- New method. Registers webhook routes on an HTTP router
- **Requires secrets** in config — throws if missing (fixes issue #1)

### Remove `createNotification()` standalone export
- Replaced by `notifications.defineEvent()`

### JSDoc
- **Document every public method** with examples and edge cases (fixes issue #11)
- Document: dedup behavior, SMS async behavior, transactional bypass, return value semantics

**Files:** `src/client/index.ts`

## Step 8: Update channel adapters

- **Export `RenderedEmail`, `RenderedPush`, `RenderedSms`** from main entry point (fixes issue #12)
- No logic changes needed — adapters are already clean

**Files:** `src/client/adapters.ts`, `src/client/index.ts` (re-exports)

## Step 9: Rewrite React hooks (`src/react/index.ts`)

- **Add mutation hooks**: `useMarkRead`, `useMarkAllRead`, `useArchive`, `useUpdatePreference`
- Each wraps `useMutation()` from convex/react
- Keep existing query hooks
- Update `NotificationsProvider` to accept the new `api()` output shape
- Update type for `NotificationsApi`

**Files:** `src/react/index.ts`

## Step 10: Rewrite all tests

Every test file needs updating to match the new API:

- `src/client/index.test.ts` — new `defineEvent()` pattern, `SendResult` union, dedupe returns not throws, broader ctx types
- `src/component/inbox.test.ts` — paginated `markAllRead()`
- `src/component/preferences.test.ts` — `defaultMode` parameter
- `src/component/scheduled.test.ts` — new storage format (no templates)
- `src/component/delivery.test.ts` — `"queued"` status, `reason` field
- `src/component/deduplication.test.ts` — user-scoped keys
- `src/component/webhooks/` tests (if any) — fail-loud behavior
- `example/convex/example.test.ts` — new API patterns

**Files:** All `*.test.ts` files

## Step 11: Rewrite example app

Complete rewrite to demonstrate the new API:

- `example/convex/example.ts`:
  - `new Notifications(component, { channels, resolvers, defaults })` — no auth in constructor
  - `notifications.defineEvent()` — not `createNotification()`
  - `notifications.api({ auth })` — auth here
  - `notifications.send()` returns union
  - `notifications.sendMany()` with actor
  - `required: true` not `transactional: true`
- `example/convex/http.ts`:
  - `notifications.registerWebhooks(http, { ... })` — not manual routes
- `example/src/App.tsx`:
  - Use new mutation hooks

**Files:** `example/convex/example.ts`, `example/convex/http.ts`, `example/src/App.tsx`

## Step 12: Update all documentation

- **README.md** — Full rewrite of examples, API reference, quick start
- **DECISIONS.md** — Document new design rationale (auth separation, defineEvent registration, SendResult union, etc.)
- **CHANGELOG.md** — v2.0.0 entry with breaking changes
- **ROADMAP.md** — Update completed milestones
- **CLAUDE.md** — Update architecture section, key patterns, code examples

**Files:** `README.md`, `DECISIONS.md`, `CHANGELOG.md`, `ROADMAP.md`, `CLAUDE.md`

## Step 13: Build, codegen, test

- Run `npm run build:codegen` (required after schema/function changes)
- Run `npm run test` — fix any failures
- Run `npm run typecheck` — fix any type errors
- Run `npm run lint` — fix any lint issues

## Step 14: Commit and push

- Single commit: "Redesign consumer API (v2.0.0)"
- Push to `claude/research-api-design-k8gXc`
