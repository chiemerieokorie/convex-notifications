## [1.3.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.2.1...v1.3.0) (2026-02-04)

### Features

* implement api() method for plug-and-play exports ([7a93178](https://github.com/chiemerieokorie/convex-notifications/commit/7a9317840d25e44c0b63511169f269902cbfda6b))
* implement channel adapters for expo-push-notifications, resend, and twilio ([ac6166e](https://github.com/chiemerieokorie/convex-notifications/commit/ac6166e39ad63b3c1d1383abec59a0b4fb875265))
* implement registerPushToken API ([17865b4](https://github.com/chiemerieokorie/convex-notifications/commit/17865b482009dc2c3ed27a72f55e70a2e1762819))

## [1.2.1](https://github.com/chiemerieokorie/convex-notifications/compare/v1.2.0...v1.2.1) (2026-02-03)

### Bug Fixes

* update delivery status after dispatch ([a6ca8de](https://github.com/chiemerieokorie/convex-notifications/commit/a6ca8dea4869c10ee4a262a5c82ec4f5664497fd))

## [1.2.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.1.0...v1.2.0) (2026-02-03)

### Features

* **email:** implement html field for React Email support ([42aa387](https://github.com/chiemerieokorie/convex-notifications/commit/42aa38737a994070593cd4ebef309848f045e2e1))

## [Unreleased]

### Features

* **email**: implement `html` field on `EmailTemplate<T>` for React Email support
  - Supports sync and async functions: `html: (data) => render(<Component />)`
  - Works with any HTML-producing tool (React Email, MJML, etc.)
  - Plain text `body` field serves as fallback for email clients without HTML support

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
