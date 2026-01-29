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
