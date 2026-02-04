# Roadmap

Semantic versioning roadmap for `convex-notifications`.

## v1.4.0 - Current Release ✓

All foundation features have been implemented and released:

- [x] Component schema (notifications, preferences, deduplication, deliveryLog, pushTokens)
- [x] `Notifications` class with auth injection (constructor pattern)
- [x] `NotificationDefinition<T>` typed event definitions with per-channel templates
- [x] `createNotification<T>()` helper function for type-safe event creation
- [x] `api()` method for plug-and-play query/mutation exports
- [x] Transactional flag (bypasses user preferences)
- [x] Idempotency via `deduplicationKey`
- [x] Inbox: `list` (paginated), `unreadCount`, `markRead`, `markAllRead`, `archive`
- [x] 3-level preference resolution (global > category > event)
- [x] `html?` field on email templates (React Email compatible)
- [x] Push token registration, management, and deletion
- [x] Channel adapter integration: push (Expo), email (Resend), SMS (Twilio)
- [x] Delivery log tracking with status updates
- [x] React hooks: `useNotifications()`, `useUnreadCount()`, `usePreferences()`
- [x] NotificationsProvider context for React apps
- [x] Example app with 70+ integration tests
- [x] CI: test/lint/typecheck with release gated on passing tests
- [x] Input validation utilities for email, phone, and push tokens

## v1.5.0 - Delivery Reliability (next)

- [x] Webhook handlers for delivery status (Resend events, Twilio callbacks)
- [x] Deduplication key cleanup cron (automatic TTL-based cleanup)
- [ ] Retry logic via workflow component
- [ ] Channel fallback (push > email after N minutes unread)

## v1.6.0 - Scheduled + Recurring

- [x] Delayed sends (schedule notification for future delivery)
- [ ] Recurring notifications via crons component
- [ ] Smart send timing based on user behavior

## v2.0.0 - Digests + Batching

- [ ] Digest mode per event type (aggregate multiple events into one notification)
- [ ] Configurable digest windows (hourly, daily, weekly)
- [ ] Notification grouping and stacking in inbox

## v2.1.0 - Analytics + Admin

- [ ] Send / delivered / read rate analytics
- [ ] Admin dashboard hooks for monitoring
- [ ] Export and reporting capabilities

## v3.0.0 - Extended Channels

- [ ] Slack channel adapter
- [ ] Discord channel adapter
- [ ] Generic webhook channel adapter
- [ ] Custom channel adapter API

## Future

- CLI init command (`npx convex-notifications init`)
- A/B testing for notification content
- Timezone-aware scheduling
- User engagement optimization
- Template versioning and rollback
