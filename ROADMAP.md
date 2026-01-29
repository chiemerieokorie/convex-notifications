# Roadmap

Semantic versioning roadmap for `convex-notifications`.

## v1.1.0 - Foundation

- [x] Component schema (notifications, preferences, deduplication, deliveryLog)
- [x] `Notifications` class with auth injection (constructor pattern)
- [x] `NotificationDefinition<T>` typed event definitions with per-channel templates
- [x] `api()` method for plug-and-play query/mutation exports
- [x] Transactional flag (bypasses user preferences)
- [x] Idempotency via `deduplicationKey`
- [x] Inbox: `list` (paginated), `unreadCount`, `markRead`, `markAllRead`, `archive`
- [x] 3-level preference resolution (global > category > event)
- [x] Example app with 35 integration tests
- [x] CI: test/lint/typecheck with release gated on passing tests

## v1.2.0 - v1.0.0 Stable Architecture (current)

- [x] `actionUrl` and `imageUrl` fields on notifications (deep linking)
- [x] `html?` field on email templates (React Email compatible)
- [x] `by_userId_active` index for proper pagination (replaces `.collect()` + `.filter()`)
- [x] Batched `markAllRead` with continuation (avoids 10s mutation timeout)
- [x] Rate limiting via `@convex-dev/rate-limiter` child component
- [x] Batch-on-write notification collapsing (`pendingBatches` table)
- [x] Cancellation keys for pending notifications
- [x] Quiet hours / timezone support (via consumer-provided settings resolver)
- [x] `registerDeliveryWebhooks()` for Resend + Twilio status callbacks (Stripe pattern)
- [x] `ChannelAdapter` interface with ResendAdapter, ExpoAdapter, TwilioAdapter stubs
- [x] Enhanced React hooks: `useNotifications(api)` with mutations + unreadCount
- [x] Enhanced React hooks: `usePreferences(api)` with updatePreference mutation
- [x] `SendArgs<T>` type with `cancellationKey` support
- [x] `RateLimitConfig` and `BatchConfig<T>` on `NotificationDefinition`
- [x] `UserSettings` resolver for timezone/quiet hours
- [x] 45+ integration tests

## v1.3.0 - Channel Adapters (Live Dispatch)

- [ ] Mutation → scheduled action split for channel delivery
- [ ] Expo push adapter (live dispatch via action)
- [ ] Resend email adapter (live dispatch via action)
- [ ] Twilio SMS adapter (live dispatch via action)
- [ ] Push token registration passthrough
- [ ] Delivery status tracking end-to-end

## v1.4.0 - Delivery Reliability

- [ ] Retry logic via workflow component
- [ ] Channel fallback chains (push → email after N minutes)
- [ ] Throttling configuration per NotificationDefinition

## v1.5.0 - Scheduling

- [ ] Delayed sends (schedule notification for future delivery)
- [ ] Recurring notifications via crons component
- [ ] Deduplication key cleanup cron
- [ ] Batch flush cron (automatic pending batch processing)

## v1.6.0 - Digests

- [ ] Digest mode (heterogeneous events → periodic summary)
- [ ] Configurable digest windows (hourly, daily, weekly)

## v1.7.0 - Analytics + Admin

- [ ] Send / delivered / read rate tracking
- [ ] Admin dashboard hooks for monitoring

## Future

- Additional channels (Slack, Discord, webhooks)
- Notification grouping and stacking in inbox
- A/B testing for notification content
- Visual workflow builder
