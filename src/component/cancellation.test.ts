import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("stores and cancels by key", async () => {
    const t = initConvexTest();
    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test",
        title: "Test",
        body: "Test",
      },
    );

    await t.mutation(internal.cancellation.storeCancellationKey, {
      key: "cancel-me",
      notificationId,
    });

    const cancelled = await t.mutation(
      internal.cancellation.cancelByKey,
      { key: "cancel-me" },
    );
    expect(cancelled).toBe(true);

    // Notification should be archived
    const list = await t.query(internal.inbox.list, { userId: "user1" });
    expect(list.notifications).toHaveLength(0);
  });

  test("cancelByKey returns false for unknown key", async () => {
    const t = initConvexTest();
    const cancelled = await t.mutation(
      internal.cancellation.cancelByKey,
      { key: "unknown" },
    );
    expect(cancelled).toBe(false);
  });

  test("checkCancelled returns true for archived notification", async () => {
    const t = initConvexTest();
    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test",
        title: "Test",
        body: "Test",
      },
    );

    await t.mutation(internal.inbox.archive, {
      userId: "user1",
      notificationId,
    });

    const isCancelled = await t.query(
      internal.cancellation.checkCancelled,
      { notificationId },
    );
    expect(isCancelled).toBe(true);
  });
});
