## [1.2.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.1.0...v1.2.0) (2026-01-29)

### Features

* **schema**: add `actionUrl` and `imageUrl` fields to notifications table for deep linking
* **schema**: add `by_userId_active` index for efficient pagination (replaces `.collect()` + `.filter()`)
* **schema**: add `pendingBatches` table for batch-on-write notification collapsing
* **schema**: add `cancellationKeys` table for pending notification cancellation
* **types**: add `html?` to `EmailTemplate` for React Email rendering
* **types**: add `actionUrl?` and `imageUrl?` to `InboxTemplate`
* **types**: add `RateLimitConfig`, `BatchConfig<T>`, `ChannelAdapter`, `SendArgs<T>` types
* **types**: add `UserSettings` resolver for timezone/quiet hours
* **inbox**: fix `list()` to use index-based pagination with `.take()` instead of `.collect()`
* **inbox**: add batched `markAllRead` with `batchSize` param to avoid mutation timeouts
* **rate-limit**: integrate `@convex-dev/rate-limiter` as child component for per-event rate limiting
* **batching**: add batch-on-write accumulation with configurable flush windows
* **cancellation**: add `cancel()` method with `cancellationKey` support on `send()`
* **quiet-hours**: skip external channel dispatch during user quiet hours (non-transactional)
* **webhooks**: add `registerDeliveryWebhooks()` following convex-stripe pattern
* **adapters**: add `ChannelAdapter` interface with Resend, Expo, Twilio stub adapters
* **react**: upgrade `useNotifications()` to accept full API object with mutations
* **react**: upgrade `usePreferences()` to accept API object with updatePreference mutation
* **tests**: add cancellation, batching test suites; update inbox and client tests

## [1.1.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.0.0...v1.1.0) (2026-01-29)

### Features

* implement v0.1.0 notifications engine core ([a251ee5](https://github.com/chiemerieokorie/convex-notifications/commit/a251ee5899329a4cf68c79e0e7d0b9fa0e7c3da0))
* update example app with notifications inbox UI and events ([5a25cb0](https://github.com/chiemerieokorie/convex-notifications/commit/5a25cb02491eea137817162d49b0a5e6f3e54494))

## 1.0.0 (2026-01-29)

### Features

* initial convex-notifications component ([a0b282e](https://github.com/chiemerieokorie/convex-notifications/commit/a0b282e1e59e5e2de5188274828d811651d7f32f))

### Bug Fixes

* align release workflow with OIDC trusted publishing ([4f734ed](https://github.com/chiemerieokorie/convex-notifications/commit/4f734ed19f0b93714145a261d6f2c2711f2dbbe6))
* exclude .examples from eslint and gitignore ([fd9eb71](https://github.com/chiemerieokorie/convex-notifications/commit/fd9eb71280429b3971657d63faa18b7f70fdd2c6))
* exclude .examples from vitest test discovery ([4100966](https://github.com/chiemerieokorie/convex-notifications/commit/410096654c0c6fd22b78da1c9072b6597e805c38))

# Changelog

## 0.1.0

### Foundation Release

- Component schema: notifications, preferences, deduplication, deliveryLog tables
- `Notifications` class with constructor-based auth injection
- `NotificationDefinition<T>` typed event definitions with per-channel templates
- `api()` method for zero-boilerplate query/mutation exports
- `html?` field on `EmailTemplate<T>` for React Email support
- Inbox: paginated list, unreadCount, markRead, markAllRead, archive
- 3-level user preference hierarchy (global > category > event)
- Transactional notification flag (bypasses preferences)
- Idempotency via deduplication keys with configurable TTL
- Delivery log stubs for email, push, SMS channels
- 35 integration tests with convex-test
- CI pipeline with release gated on test/lint/typecheck

## 0.0.0

- Initial template scaffolding.
