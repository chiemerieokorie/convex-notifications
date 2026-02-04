import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("channel fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("queues fallback for notification", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    // Create a notification
    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    // Queue fallback
    const fallbackId = await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 30 * 60 * 1000, // 30 minutes
    });

    expect(fallbackId).toBeDefined();

    // Verify it's in the queue
    const status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status).toHaveLength(1);
    expect(status[0].status).toBe("pending");
    expect(status[0].fromChannel).toBe("push");
    expect(status[0].toChannel).toBe("email");
    expect(status[0].fallbackAt).toBe(now + 30 * 60 * 1000);
  });

  test("processFallbacks triggers unread notifications", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 1000, // 1 second
    });

    // Process now - should not trigger
    const result1 = await t.mutation(internal.fallback.processFallbacks, {
      batchSize: 10,
    });
    expect(result1.processed).toBe(0);

    // Advance time past fallback delay
    vi.setSystemTime(now + 2000);

    // Process again - should trigger
    const result2 = await t.mutation(internal.fallback.processFallbacks, {
      batchSize: 10,
    });
    expect(result2.processed).toBe(1);
    expect(result2.triggered).toBe(1);
    expect(result2.cancelled).toBe(0);

    // Verify status is triggered
    const status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status[0].status).toBe("triggered");
  });

  test("processFallbacks cancels if notification was read before processing", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 1000,
    });

    // Mark notification as read - this should cancel the fallback immediately
    await t.mutation(internal.inbox.markRead, {
      userId: "user1",
      notificationId,
    });

    // Verify the fallback was cancelled by markRead
    const status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status[0].status).toBe("cancelled");

    // Advance time and process - nothing should be processed
    vi.setSystemTime(now + 2000);
    const result = await t.mutation(internal.fallback.processFallbacks, {
      batchSize: 10,
    });

    // Nothing to process since markRead already cancelled
    expect(result.processed).toBe(0);
  });

  test("markRead cancels pending fallbacks", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 30 * 60 * 1000,
    });

    // Verify fallback is pending
    let status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status[0].status).toBe("pending");

    // Mark notification as read
    await t.mutation(internal.inbox.markRead, {
      userId: "user1",
      notificationId,
    });

    // Verify fallback is cancelled
    status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status[0].status).toBe("cancelled");
  });

  test("cancelFallback cancels pending fallbacks", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 30 * 60 * 1000,
    });

    // Cancel the fallback
    const cancelled = await t.mutation(internal.fallback.cancelFallback, {
      notificationId,
    });
    expect(cancelled).toBe(1);

    // Verify status is cancelled
    const status = await t.query(internal.fallback.getFallbackStatus, {
      notificationId,
    });
    expect(status[0].status).toBe("cancelled");
  });

  test("getTriggeredFallbacks returns triggered fallbacks", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 1000,
    });

    // Advance time and process
    vi.setSystemTime(now + 2000);
    await t.mutation(internal.fallback.processFallbacks, { batchSize: 10 });

    // Get triggered fallbacks
    const triggered = await t.query(internal.fallback.getTriggeredFallbacks, {
      batchSize: 10,
    });
    expect(triggered).toHaveLength(1);
    expect(triggered[0].notificationId).toBe(notificationId);
    expect(triggered[0].userId).toBe("user1");
    expect(triggered[0].fromChannel).toBe("push");
    expect(triggered[0].toChannel).toBe("email");
  });

  test("markAllRead cancels all pending fallbacks", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    // Create multiple notifications with fallbacks
    const notificationId1 = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test 1",
        body: "Test body 1",
      },
    );

    const notificationId2 = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test 2",
        body: "Test body 2",
      },
    );

    await t.mutation(internal.fallback.queueFallback, {
      notificationId: notificationId1,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 30 * 60 * 1000,
    });

    await t.mutation(internal.fallback.queueFallback, {
      notificationId: notificationId2,
      userId: "user1",
      fromChannel: "push",
      toChannel: "email",
      delayMs: 30 * 60 * 1000,
    });

    // Mark all as read
    await t.mutation(internal.inbox.markAllRead, { userId: "user1" });

    // Verify all fallbacks are cancelled
    const status1 = await t.query(internal.fallback.getFallbackStatus, {
      notificationId: notificationId1,
    });
    const status2 = await t.query(internal.fallback.getFallbackStatus, {
      notificationId: notificationId2,
    });

    expect(status1[0].status).toBe("cancelled");
    expect(status2[0].status).toBe("cancelled");
  });
});
