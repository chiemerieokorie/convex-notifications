# Roadmap

Semantic versioning roadmap for `convex-notifications`.

## v0.1.0 - Foundation (current)

- [x] Component schema (notifications, preferences, deduplication, deliveryLog)
- [x] `Notifications` class with auth injection (constructor pattern)
- [x] `NotificationDefinition<T>` typed event definitions with per-channel templates
- [x] `api()` method for plug-and-play query/mutation exports
- [x] Transactional flag (bypasses user preferences)
- [x] Idempotency via `deduplicationKey`
- [x] Inbox: `list` (paginated), `unreadCount`, `markRead`, `markAllRead`, `archive`
- [x] 3-level preference resolution (global > category > event)
- [x] `html?` field on email templates (React Email compatible) ✓ implemented
- [x] Example app with 35 integration tests
- [x] CI: test/lint/typecheck with release gated on passing tests
- [x] Channel adapter infrastructure (`src/component/channels/`)
- [x] Channel adapter integration: push (Expo), email (Resend), SMS (Twilio)
- [ ] Push token registration passthrough
- [ ] React hooks for inbox and preferences

## v0.2.0 - Push Token Management & Hooks

- Push token registration and management passthrough
- Delivery log status tracking with webhook handlers
- React hooks for inbox and preferences

## v0.3.0 - React Hooks + Client SDK

- `useNotifications()` hook (list, unreadCount, realtime)
- `usePreferences()` hook for settings UI
- `useCategoryPreferences()` hook for grouped settings
- Optimistic updates for markRead/archive

## v0.4.0 - Delivery Reliability

- Webhook handlers for delivery status (Resend events, Twilio callbacks)
- Retry logic via workflow component
- Channel fallback (push > email after N minutes unread)

## v0.5.0 - Scheduled + Recurring

- Delayed sends (schedule notification for future delivery)
- Recurring notifications via crons component
- Smart send timing based on user behavior
- Deduplication key cleanup cron

## v0.6.0 - Digests + Batching

- Digest mode per event type (aggregate multiple events into one notification)
- Configurable digest windows (hourly, daily, weekly)

## v0.7.0 - Analytics + Admin

- Send / delivered / read rate analytics
- Admin dashboard hooks for monitoring

## v1.0.0 - Stable Release

- API stabilization and semver commitment
- CLI init command (`npx convex-notifications init`)
- Comprehensive documentation
- Published to npm and Convex Components directory

## Future

- Additional channels (Slack, Discord, webhooks)
- Notification grouping and stacking in inbox
- A/B testing for notification content
- Timezone-aware scheduling
