# Roadmap

Semantic versioning roadmap for `convex-notifications`.

## v0.1.0 - Foundation

- Component schema (notifications, preferences, deduplication, deliveryLog)
- `createNotificationsApi()` factory with auth injection
- `createNotification<T>()` factory (templates receive only `data`, engine resolves addresses)
- Transactional flag (bypasses user preferences)
- Idempotency via `deduplicationKey`
- 3 channel adapters: push (Expo), email (Resend), SMS (Twilio)
- Inbox: `list` (paginated), `unreadCount`, `markRead` (timestamp-based), `markAllRead`, `archive`
- Event-level preference CRUD
- Push token passthrough to expo-push-notifications component
- React hooks for inbox and preferences
- Example app with tests

## v0.2.0 - Preference Hierarchy + Categories

- 3-level preference resolution: global > category > event
- Notification categories (runtime grouping of event types)
- `useCategoryPreferences()` hook for grouped settings UI

## v0.3.0 - React Email + Templates

- `emailComponent` field on event definitions for React Email JSX
- Node action renderer for email templates
- Email template helpers and utilities

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
