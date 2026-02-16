## [1.9.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.8.0...v1.9.0) (2026-02-16)

### Features

* add branded ID types for compile-time safety ([be9a30b](https://github.com/chiemerieokorie/convex-notifications/commit/be9a30bdca465d990df8ea227244c4c832d22aaf))

## [1.8.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.7.2...v1.8.0) (2026-02-16)

### Features

* add consumer-facing document types and typed api() returns ([1ebf003](https://github.com/chiemerieokorie/convex-notifications/commit/1ebf0031d0c930b1a0921ceea9bde2b653f22902))

## [1.7.2](https://github.com/chiemerieokorie/convex-notifications/compare/v1.7.1...v1.7.2) (2026-02-16)

### Bug Fixes

* inline component returns validators for typed codegen output ([9328092](https://github.com/chiemerieokorie/convex-notifications/commit/93280927e178123600969aa6c6893f38dcb6dd55))

## [1.7.1](https://github.com/chiemerieokorie/convex-notifications/compare/v1.7.0...v1.7.1) (2026-02-16)

### Bug Fixes

* remove explicit _creationTime from index definitions ([c6de133](https://github.com/chiemerieokorie/convex-notifications/commit/c6de133f4dd88966c597af01880312e61e35e43d))

## [1.7.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.6.0...v1.7.0) (2026-02-16)

### Features

* replace channel string with typed ChannelName union ([dd89655](https://github.com/chiemerieokorie/convex-notifications/commit/dd89655fa16887751f5821ac06b5945df71eadcd))

## [1.6.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.5.1...v1.6.0) (2026-02-16)

### Features

* type React hooks, add document types, require inbox channel ([d227d8b](https://github.com/chiemerieokorie/convex-notifications/commit/d227d8b17ef0f9dc757bd6491c1e765aea9e3fc6))

## [1.5.1](https://github.com/chiemerieokorie/convex-notifications/compare/v1.5.0...v1.5.1) (2026-02-15)

### Bug Fixes

* address multiple code review issues across the component ([888a759](https://github.com/chiemerieokorie/convex-notifications/commit/888a759cd1ea1bc8df1167d07844345709e063e8))
* update example app to use usePaginatedQuery with new list format ([bd5e0ca](https://github.com/chiemerieokorie/convex-notifications/commit/bd5e0ca4f69d64e564d944780fa9e68998db245e))

## [1.5.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.4.0...v1.5.0) (2026-02-14)

### Features

* add multi-tenant support with dynamic sender identity resolution ([fa96cfe](https://github.com/chiemerieokorie/convex-notifications/commit/fa96cfec7a905e8f0b9bd20ff10bb4b9a435590f))
* add tests, webhook router, and channel fallback feature ([9a3ffed](https://github.com/chiemerieokorie/convex-notifications/commit/9a3ffed08b184295b3168fd6f2876e9e9496ad47))
* implement full notification component with all features ([a7d43c7](https://github.com/chiemerieokorie/convex-notifications/commit/a7d43c75835cb9de1ee3b059e63a6430654f1c68))

### Bug Fixes

* add vitest aliases so example tests resolve source files ([30500ca](https://github.com/chiemerieokorie/convex-notifications/commit/30500cae1ad613cfab6bd5dee85a822940d2c8c7))
* address PR review issues - security, performance, and correctness ([e616587](https://github.com/chiemerieokorie/convex-notifications/commit/e6165872d3ac1748f091b64f5108cc0a2fc58458))
* resolve lint errors - unused imports, unused var, conditional hooks ([5e8cb8d](https://github.com/chiemerieokorie/convex-notifications/commit/5e8cb8dce55d71072074e1b9e120d95ef67d06ba))
* resolve TypeScript errors and consolidate processor functions ([fc90358](https://github.com/chiemerieokorie/convex-notifications/commit/fc90358015f4f3a70e408a66ede544f95fa9ef6e))
* tenant isolation checks and dedup key scoping bugs ([e935fec](https://github.com/chiemerieokorie/convex-notifications/commit/e935fec1b478e8044b327d6bcaca3793991b14a8))
* update generated component types with tenantId and fix resend webhook type error ([02a24fd](https://github.com/chiemerieokorie/convex-notifications/commit/02a24fd04d4284194690d5a114b193529793560a))

## [1.4.0](https://github.com/chiemerieokorie/convex-notifications/compare/v1.3.0...v1.4.0) (2026-02-04)

### Features

* **channels:** add channel adapter infrastructure ([6d867b3](https://github.com/chiemerieokorie/convex-notifications/commit/6d867b3f682e93e1a4d84ab57430e2a44effe922))
* **channels:** integrate child components for dispatch ([97fd312](https://github.com/chiemerieokorie/convex-notifications/commit/97fd312a45803585aa00ee067c3a0d8a7d1776f7))

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
