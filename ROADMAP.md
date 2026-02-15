# Roadmap

Semantic versioning roadmap for `convex-notifications`.

## v2.0.0 - Current Release (API Redesign)

Full consumer API redesign focused on developer experience:

- [x] `defineEvent<T>()` replaces `createNotification<T>()` (clearer naming)
- [x] `required` replaces `transactional` on event definitions
- [x] `SendResult` discriminated union (dedup returns value, not exception)
- [x] `SendCtx` broad context type (no more `as any` casting)
- [x] Auth moved from constructor to `api({ auth })` (separation of concerns)
- [x] `sendMany()` with actor exclusion
- [x] `dedupe` auto-scoped to userId (prevents cross-user dedup bugs)
- [x] `"queued"` delivery status for async SMS
- [x] `defaultPreferenceMode: "opt-in" | "opt-out"`
- [x] `markAllRead` batched with `{ marked, hasMore }` return
- [x] Webhook secrets required (fail loud, not silent)
- [x] Scheduled notifications store event+data only (no stale templates)
- [x] React mutation hooks: `useMarkRead`, `useMarkAllRead`, `useArchive`, `useUpdatePreference`
- [x] `RenderedEmail`, `RenderedPush`, `RenderedSms` exported from main entry
- [x] Full documentation rewrite

## v1.5.0 - Delivery Reliability

- [x] Webhook handlers for delivery status (Resend events, Twilio callbacks)
- [x] Deduplication key cleanup cron (automatic TTL-based cleanup)
- [x] Retry queue infrastructure
- [x] Channel fallback infrastructure (push > email)

## v1.4.0 - Foundation

- [x] Component schema (notifications, preferences, deduplication, deliveryLog, pushTokens)
- [x] `Notifications` class with constructor-based auth injection
- [x] `api()` method for zero-boilerplate query/mutation exports
- [x] Inbox: `list` (paginated), `unreadCount`, `markRead`, `markAllRead`, `archive`
- [x] 3-level preference resolution (global > category > event)
- [x] `html?` field on email templates (React Email compatible)
- [x] Push token registration, management, and deletion
- [x] Channel adapter integration: push (Expo), email (Resend), SMS (Twilio)
- [x] Delivery log tracking with status updates
- [x] React hooks: `useNotifications()`, `useUnreadCount()`, `usePreferences()`
- [x] Example app with integration tests
- [x] CI: test/lint/typecheck with release gated on passing tests

## Future

- [ ] Retry logic via workflow component (active dispatch retry)
- [ ] Channel fallback processing (push > email after N minutes unread)
- [ ] Recurring notifications via crons component
- [ ] Digest mode per event type (aggregate into one notification)
- [ ] Configurable digest windows (hourly, daily, weekly)
- [ ] Notification grouping and stacking in inbox
- [ ] Send / delivered / read rate analytics
- [ ] Slack channel adapter
- [ ] Discord channel adapter
- [ ] Generic webhook channel adapter
- [ ] Custom channel adapter API
- [ ] CLI init command (`npx convex-notifications init`)
