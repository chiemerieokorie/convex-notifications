import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("retry queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("queues failed delivery for retry", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    // Create a notification first
    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    // Create a delivery log
    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
      metadata: { error: "Connection timeout" },
    });

    // Queue for retry
    const retryId = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: { to: "test@example.com", subject: "Test" },
      error: "Connection timeout",
    });

    expect(retryId).toBeDefined();

    // Verify it's in the queue
    const stats = await t.query(internal.retry.getRetryStats, {
      notificationId,
    });
    expect(stats).toHaveLength(1);
    expect(stats[0].status).toBe("pending");
    expect(stats[0].attempt).toBe(1);
    expect(stats[0].channel).toBe("email");
  });

  test("prevents duplicate retry queue entries", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    // Queue first retry
    const retryId1 = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error 1",
    });

    // Try to queue again - should return null
    const retryId2 = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error 2",
    });

    expect(retryId1).toBeDefined();
    expect(retryId2).toBeNull();
  });

  test("getPendingRetries returns ready retries", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    // Queue with short initial delay
    await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error",
      initialDelayMs: 1000, // 1 second
    });

    // Should not be ready yet
    const pending1 = await t.query(internal.retry.getPendingRetries, {
      batchSize: 10,
    });
    expect(pending1).toHaveLength(0);

    // Advance time
    vi.setSystemTime(now + 2000);

    // Should be ready now
    const pending2 = await t.query(internal.retry.getPendingRetries, {
      batchSize: 10,
    });
    expect(pending2).toHaveLength(1);
  });

  test("markRetryFailed schedules next attempt with backoff", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    const retryId = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error 1",
      maxAttempts: 3,
    });

    // Mark as processing then failed
    await t.mutation(internal.retry.markRetryProcessing, { id: retryId! });
    const result = await t.mutation(internal.retry.markRetryFailed, {
      id: retryId!,
      error: "Still failing",
    });

    expect(result.willRetry).toBe(true);
    expect(result.nextAttempt).toBe(2);
    expect(result.exhausted).toBe(false);

    // Verify attempt was incremented
    const stats = await t.query(internal.retry.getRetryStats, {
      notificationId,
    });
    expect(stats[0].attempt).toBe(2);
    expect(stats[0].status).toBe("pending");
  });

  test("marks exhausted after max attempts", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    const retryId = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error",
      maxAttempts: 2, // Only 2 attempts
    });

    // First failure
    await t.mutation(internal.retry.markRetryProcessing, { id: retryId! });
    await t.mutation(internal.retry.markRetryFailed, {
      id: retryId!,
      error: "Fail 1",
    });

    // Advance time for next retry
    vi.setSystemTime(now + 120000);

    // Second failure (should exhaust)
    await t.mutation(internal.retry.markRetryProcessing, { id: retryId! });
    const result = await t.mutation(internal.retry.markRetryFailed, {
      id: retryId!,
      error: "Fail 2",
    });

    expect(result.willRetry).toBe(false);
    expect(result.exhausted).toBe(true);

    // Verify status is exhausted
    const stats = await t.query(internal.retry.getRetryStats, {
      notificationId,
    });
    expect(stats[0].status).toBe("exhausted");
  });

  test("markRetrySucceeded updates status", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    const retryId = await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error",
    });

    await t.mutation(internal.retry.markRetryProcessing, { id: retryId! });
    await t.mutation(internal.retry.markRetrySucceeded, { id: retryId! });

    const stats = await t.query(internal.retry.getRetryStats, {
      notificationId,
    });
    expect(stats[0].status).toBe("succeeded");
  });

  test("processRetryQueue marks items as processing", async () => {
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

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "failed",
    });

    await t.mutation(internal.retry.queueRetry, {
      notificationId,
      deliveryLogId,
      channel: "email",
      rendered: {},
      error: "Error",
      initialDelayMs: 1000,
    });

    // Advance time past retry delay
    vi.setSystemTime(now + 2000);

    // Process the queue
    const result = await t.mutation(
      internal.notifications.processRetryQueue,
      { batchSize: 10 },
    );

    expect(result.processed).toBe(1);
    expect(result.readyForRetry).toHaveLength(1);

    // Verify status changed to processing
    const stats = await t.query(internal.retry.getRetryStats, {
      notificationId,
    });
    expect(stats[0].status).toBe("processing");
  });
});
