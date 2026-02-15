import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("scheduled notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("schedules notification for future delivery", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const scheduledFor = now + 60000; // 1 minute from now

    const id = await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "test.event",
      title: "Test Title",
      body: "Test Body",
      scheduledFor,
      channels: { inbox: true },
    });

    expect(id).toBeDefined();

    // Verify it's in the database with pending status
    const scheduled = await t.query(internal.scheduled.getScheduledNotifications, {
      userId: "user1",
      status: "pending",
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].event).toBe("test.event");
    expect(scheduled[0].status).toBe("pending");
  });

  test("rejects scheduledFor in the past", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    await expect(
      t.mutation(internal.scheduled.scheduleNotification, {
        userId: "user1",
        event: "test.event",
        title: "Test Title",
        body: "Test Body",
        scheduledFor: now - 1000, // In the past
        channels: { inbox: true },
      }),
    ).rejects.toThrow("scheduledFor must be in the future");
  });

  test("cancels pending scheduled notification", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const id = await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "test.event",
      title: "Test Title",
      body: "Test Body",
      scheduledFor: now + 60000,
      channels: { inbox: true },
    });

    const cancelled = await t.mutation(
      internal.scheduled.cancelScheduledNotification,
      {
        id,
        userId: "user1",
      },
    );
    expect(cancelled).toBe(true);

    // Verify status is cancelled
    const scheduled = await t.query(internal.scheduled.getScheduledNotifications, {
      userId: "user1",
    });
    expect(scheduled[0].status).toBe("cancelled");
  });

  test("cannot cancel another user's notification", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const id = await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "test.event",
      title: "Test Title",
      body: "Test Body",
      scheduledFor: now + 60000,
      channels: { inbox: true },
    });

    const cancelled = await t.mutation(
      internal.scheduled.cancelScheduledNotification,
      {
        id,
        userId: "user2", // Different user
      },
    );
    expect(cancelled).toBe(false);
  });

  test("processScheduledNotifications creates notifications when due", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    // Schedule for 1 minute from now
    await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "test.event",
      title: "Scheduled Title",
      body: "Scheduled Body",
      scheduledFor: now + 60000,
      channels: { inbox: true },
    });

    // Process now - nothing should happen
    const result1 = await t.mutation(
      internal.notifications.processScheduledNotifications,
      { batchSize: 10 },
    );
    expect(result1.processed).toBe(0);

    // Advance time past the scheduled time
    vi.setSystemTime(now + 120000);

    // Process again - should create notification
    const result2 = await t.mutation(
      internal.notifications.processScheduledNotifications,
      { batchSize: 10 },
    );
    expect(result2.processed).toBe(1);
    expect(result2.succeeded).toBe(1);
    expect(result2.failed).toBe(0);

    // Verify notification was created in inbox
    const notifications = await t.query(internal.inbox.list, {
      userId: "user1",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(notifications.page).toHaveLength(1);
    expect(notifications.page[0].title).toBe("Scheduled Title");
  });

  test("processScheduledNotifications respects deduplication", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const dedupeKey = "unique-key-123";

    // Record deduplication key first
    await t.mutation(internal.notifications.recordDeduplication, {
      key: dedupeKey,
      ttlSeconds: 3600,
    });

    // Schedule notification with same deduplication key
    await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "test.event",
      title: "Duplicate",
      body: "Should be suppressed",
      scheduledFor: now + 1000, // Due very soon
      deduplicationKey: dedupeKey,
      channels: { inbox: true },
    });

    // Advance time and process
    vi.setSystemTime(now + 2000);
    const result = await t.mutation(
      internal.notifications.processScheduledNotifications,
      { batchSize: 10 },
    );

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);

    // Verify no notification was created
    const notifications = await t.query(internal.inbox.list, {
      userId: "user1",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(notifications.page).toHaveLength(0);
  });

  test("getScheduledNotifications filters by status", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    // Create multiple scheduled notifications
    await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "event1",
      title: "Title 1",
      body: "Body 1",
      scheduledFor: now + 60000,
      channels: { inbox: true },
    });

    const id2 = await t.mutation(internal.scheduled.scheduleNotification, {
      userId: "user1",
      event: "event2",
      title: "Title 2",
      body: "Body 2",
      scheduledFor: now + 60000,
      channels: { inbox: true },
    });

    // Cancel one
    await t.mutation(internal.scheduled.cancelScheduledNotification, {
      id: id2,
      userId: "user1",
    });

    // Query pending only
    const pending = await t.query(internal.scheduled.getScheduledNotifications, {
      userId: "user1",
      status: "pending",
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].event).toBe("event1");

    // Query cancelled only
    const cancelled = await t.query(internal.scheduled.getScheduledNotifications, {
      userId: "user1",
      status: "cancelled",
    });
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].event).toBe("event2");

    // Query all
    const all = await t.query(internal.scheduled.getScheduledNotifications, {
      userId: "user1",
    });
    expect(all).toHaveLength(2);
  });
});
