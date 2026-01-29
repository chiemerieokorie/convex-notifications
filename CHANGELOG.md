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
- `createNotificationsApi()` factory with auth injection and address resolvers
- `createNotification<T>()` event factory with per-channel templates
- Multi-channel delivery: push (Expo), email (Resend), SMS (Twilio)
- Inbox: paginated list, unreadCount, markRead, markAllRead, archive
- 3-level user preference hierarchy (global > category > event)
- Transactional notification flag (bypasses preferences)
- Idempotency via deduplication keys
- Push token registration passthrough
- React hooks for inbox and preferences
- Example app with integration tests

## 0.0.0

- Initial template scaffolding.
