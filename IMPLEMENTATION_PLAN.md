# Implementation Plan

This document outlines all issues, gaps, and a prioritized plan to fully implement the convex-notifications component.

## Current State Analysis

**Version**: 1.4.0
**Status**: Production-ready core with documentation/feature gaps
**Test Coverage**: 70+ integration tests

### Completed Features ✅

- [x] Component schema (5 tables with indexes)
- [x] `Notifications` class with auth injection
- [x] `NotificationDefinition<T>` typed event definitions
- [x] `api()` method for plug-and-play exports
- [x] Transactional notifications (bypass preferences)
- [x] Idempotency via `deduplicationKey`
- [x] Inbox: `list`, `unreadCount`, `markRead`, `markAllRead`, `archive`
- [x] 3-level preference resolution (global > category > event)
- [x] `html` field on email templates (React Email support)
- [x] Channel adapters integrated with child components (Resend, Expo Push, Twilio)
- [x] Push token registration and management
- [x] React hooks (basic implementation)
- [x] CI pipeline with release gated on tests
- [x] 70+ integration tests

---

## Issues & Gaps

### Phase 1: Documentation & Code Cleanup (Priority: HIGH)

#### 1.1 Update ROADMAP.md to Reflect Actual Progress

**Problem**: ROADMAP.md says v0.1.0 is current, but project is v1.4.0. Many items marked as incomplete are actually done.

**Files to Update**:
- `ROADMAP.md`

**Changes**:
- Mark v0.1.0 items as complete
- Update "current" marker to reflect v1.4.0
- Recategorize future work into appropriate milestones

---

#### 1.2 Remove or Refactor Orphaned Channel Adapters

**Problem**: `src/component/channels/` contains class-based adapters (EmailAdapter, PushAdapter, SmsAdapter) with TODO comments. These are NOT used - real dispatch happens in `src/client/adapters.ts`.

**Options**:
1. **Remove** - Delete the orphaned code
2. **Refactor** - Merge into client adapters as utility functions

**Recommendation**: Remove the class-based adapters and keep only the validation utilities. Export validators from channels/index.ts.

**Files**:
- `src/component/channels/email.ts` - Remove class, keep validation
- `src/component/channels/push.ts` - Remove class, keep validation
- `src/component/channels/sms.ts` - Remove class, keep validation
- `src/component/channels/dispatcher.ts` - Remove entirely (unused)
- `src/component/channels/types.ts` - Keep as reference types
- `src/component/channels/index.ts` - Update exports
- `src/component/channels/channels.test.ts` - Update tests

---

#### 1.3 Implement `createNotification()` Helper Function

**Problem**: README and CLAUDE.md document a `createNotification<T>()` factory function, but it doesn't exist. Users manually create `NotificationDefinition<T>` objects.

**Solution**: Add helper function that provides:
- Runtime validation
- Type inference
- Optional default templates

**File**: `src/client/index.ts`

```typescript
export function createNotification<T>(
  definition: NotificationDefinition<T>
): NotificationDefinition<T> {
  // Validate required fields
  if (!definition.event) {
    throw new Error("Notification definition must have an 'event' name");
  }
  if (!definition.channels || Object.keys(definition.channels).length === 0) {
    throw new Error("Notification definition must have at least one channel");
  }
  return definition;
}
```

---

### Phase 2: Developer Experience Improvements (Priority: MEDIUM)

#### 2.1 Improve React Hooks API

**Problem**: Current hooks require passing FunctionReference directly. README shows a different pattern.

**Current API**:
```typescript
const { notifications } = useNotifications(api.notifications.list);
```

**Expected API** (per README):
```typescript
const { notifications } = useNotifications();
```

**Solution**: Create a context-based provider pattern:

**Files**:
- `src/react/index.ts` - Add `NotificationsProvider` and update hooks
- `src/react/context.ts` - New file for context

```typescript
// New pattern
import { NotificationsProvider, useNotifications } from "convex-notifications/react";

// In App
<NotificationsProvider api={api.notifications}>
  <InboxComponent />
</NotificationsProvider>

// In component
const { notifications, loadMore, status } = useNotifications();
const unreadCount = useUnreadCount();
```

---

#### 2.2 Add Push Token API to `api()` Method

**Problem**: Push token methods (`registerPushToken`, `getPushTokens`, `deletePushToken`) require manual export. They should be included in `api()`.

**File**: `src/client/index.ts`

**Changes**: Add to `api()` return object:
```typescript
api() {
  return {
    // ... existing methods
    registerPushToken: mutationGeneric({...}),
    getPushTokens: queryGeneric({...}),
    deletePushToken: mutationGeneric({...}),
  };
}
```

---

#### 2.3 Add Delivery Logs to `api()` Method

**Problem**: `getDeliveryLogs` requires manual export.

**File**: `src/client/index.ts`

**Changes**: Add to `api()` return object.

---

### Phase 3: Production Features (Priority: MEDIUM-HIGH)

#### 3.1 Implement Deduplication Cleanup Cron

**Problem**: Expired deduplication keys accumulate forever in the database.

**Solution**: Add internal cron that runs daily to delete expired keys.

**Files**:
- `src/component/crons.ts` - New file
- `src/component/convex.config.ts` - Register crons component
- `src/component/deduplication.ts` - Add `cleanupExpired` mutation

**Implementation**:
```typescript
// src/component/deduplication.ts
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("deduplication")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(1000); // Batch delete

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }
    return expired.length;
  },
});
```

---

#### 3.2 Implement Webhook Handlers for Delivery Status

**Problem**: No way to track actual delivery status from Resend/Twilio.

**Solution**: Add webhook handlers that update delivery logs.

**Files**:
- `src/component/webhooks/resend.ts` - Resend delivery webhook handler
- `src/component/webhooks/twilio.ts` - Twilio status callback handler
- `src/component/webhooks/index.ts` - Export handlers

**Resend Events**:
- `email.delivered` → Update status to "delivered"
- `email.bounced` → Update status to "failed"
- `email.complained` → Update status to "failed"

**Twilio Status**:
- `delivered` → Update status to "delivered"
- `failed` / `undelivered` → Update status to "failed"

---

#### 3.3 Implement Retry Logic via Workflow Component

**Problem**: Failed deliveries are not retried.

**Solution**: Integrate workflow component for retry logic.

**Files**:
- `src/component/convex.config.ts` - Register workflow component
- `src/client/index.ts` - Add retry logic to `dispatchChannel`

**Implementation**:
```typescript
// On dispatch failure, schedule retry workflow
if (result.status === "failed" && options.retry?.enabled) {
  await ctx.runMutation(components.workflow.start, {
    workflowId: `retry:${notificationId}:${channel}`,
    workflow: retryDeliveryWorkflow,
    args: { notificationId, channel, attempt: 1 },
  });
}
```

---

### Phase 4: Advanced Features (Priority: LOW)

#### 4.1 Scheduled/Delayed Notifications

**Problem**: No way to schedule notifications for future delivery.

**Solution**: Add `scheduledFor` field and cron-based processor.

**Schema Change**:
```typescript
notifications: defineTable({
  // ... existing fields
  scheduledFor: v.optional(v.number()), // Timestamp for future delivery
  status: v.optional(v.union(
    v.literal("pending"),
    v.literal("sent"),
    v.literal("scheduled"),
  )),
})
```

**API Change**:
```typescript
await notification.send(ctx, {
  userId,
  data,
  scheduledFor: Date.now() + 60 * 60 * 1000, // 1 hour from now
});
```

---

#### 4.2 Channel Fallback

**Problem**: No way to fallback to another channel if primary fails.

**Solution**: Add fallback configuration to notification definitions.

```typescript
const notification = createNotification({
  event: "order.shipped",
  channels: {
    push: { ... },
    email: { ... },
  },
  fallback: {
    push: { to: "email", afterMinutes: 5, ifUnread: true },
  },
});
```

---

#### 4.3 Digests & Batching

**Problem**: High-frequency events spam users.

**Solution**: Implement digest mode per event type.

```typescript
const notification = createNotification({
  event: "comment.like",
  digest: {
    enabled: true,
    window: "hourly", // or "daily", "weekly"
    template: (items) => ({
      title: `${items.length} new likes`,
      body: `You received ${items.length} likes in the past hour.`,
    }),
  },
  // ...
});
```

---

#### 4.4 Analytics & Admin Dashboard

**Problem**: No visibility into notification performance.

**Solution**: Add analytics queries and admin hooks.

```typescript
// Analytics queries
export const getAnalytics = query({
  args: { timeRange: v.union(v.literal("day"), v.literal("week"), v.literal("month")) },
  handler: async (ctx, args) => {
    // Return send/delivered/read rates
  },
});
```

---

### Phase 5: Polish & Release (Priority: LOW)

#### 5.1 CLI Init Command

**Problem**: No easy way to scaffold notifications setup.

**Solution**: Add `npx convex-notifications init` command.

**Files**:
- `bin/init.js` - CLI script
- `templates/` - Scaffolding templates

---

#### 5.2 Example App Full Demo

**Problem**: Example app has child component clients commented out.

**Solution**: Update example to demonstrate full delivery flow with mock/test mode.

---

## Implementation Priority Matrix

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 1.1 Update ROADMAP | Low | High | **P0** |
| 1.2 Remove orphaned code | Medium | Medium | **P0** |
| 1.3 Add createNotification() | Low | High | **P0** |
| 2.1 Improve React hooks | Medium | Medium | P1 |
| 2.2 Add push tokens to api() | Low | Medium | P1 |
| 2.3 Add delivery logs to api() | Low | Low | P1 |
| 3.1 Deduplication cleanup cron | Low | Medium | **P1** |
| 3.2 Webhook handlers | Medium | High | **P1** |
| 3.3 Retry logic | High | High | P2 |
| 4.1 Scheduled notifications | High | Medium | P2 |
| 4.2 Channel fallback | High | Medium | P3 |
| 4.3 Digests & batching | High | Medium | P3 |
| 4.4 Analytics | Medium | Medium | P3 |
| 5.1 CLI init command | Medium | Low | P4 |
| 5.2 Example app demo | Low | Low | P4 |

---

## Recommended Execution Order

### Sprint 1: Foundation Fixes
1. Update ROADMAP.md
2. Remove/refactor orphaned channel code
3. Add `createNotification()` helper
4. Add push token and delivery log methods to `api()`

### Sprint 2: Production Readiness
1. Implement deduplication cleanup cron
2. Add Resend webhook handler
3. Add Twilio webhook handler
4. Add tests for webhooks

### Sprint 3: Reliability
1. Integrate workflow component
2. Implement retry logic
3. Add retry configuration options
4. Test retry scenarios

### Sprint 4: Advanced Features
1. Implement scheduled notifications
2. Add cron processor for scheduled items
3. Implement channel fallback
4. Add fallback tests

### Sprint 5: Scale & Polish
1. Implement digest mode
2. Add analytics queries
3. Create CLI init command
4. Update example app with full demo

---

## Success Criteria

- [ ] All ROADMAP items through v0.4.0 completed
- [ ] Documentation matches implementation
- [ ] No orphaned/dead code
- [ ] Webhook handlers for all delivery channels
- [ ] Retry logic with configurable attempts
- [ ] Deduplication cleanup running automatically
- [ ] 80%+ test coverage maintained
- [ ] Example app demonstrates all features

---

## Notes

- All changes should maintain backwards compatibility
- Each phase should be released as a minor version
- Tests must pass before merging any PR
- Update CHANGELOG.md with each release
