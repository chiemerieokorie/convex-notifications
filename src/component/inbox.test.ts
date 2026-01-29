import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("inbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates and lists notifications", async () => {
    const t = initConvexTest();
    await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test.event",
      title: "Test Title",
      body: "Test Body",
    });

    const result = await t.query(internal.inbox.list, { userId: "user1" });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].title).toBe("Test Title");
  });

  test("returns empty for different user", async () => {
    const t = initConvexTest();
    await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test.event",
      title: "Test",
      body: "Test",
    });

    const result = await t.query(internal.inbox.list, { userId: "user2" });
    expect(result.notifications).toHaveLength(0);
  });

  test("unread count", async () => {
    const t = initConvexTest();
    const id1 = await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "1",
      body: "1",
    });
    await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "2",
      body: "2",
    });

    expect(await t.query(internal.inbox.unreadCount, { userId: "user1" })).toBe(
      2,
    );

    await t.mutation(internal.inbox.markRead, {
      userId: "user1",
      notificationId: id1,
    });

    expect(await t.query(internal.inbox.unreadCount, { userId: "user1" })).toBe(
      1,
    );
  });

  test("markAllRead marks all unread and returns count", async () => {
    const t = initConvexTest();
    await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "1",
      body: "1",
    });
    await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "2",
      body: "2",
    });

    const result = await t.mutation(internal.inbox.markAllRead, {
      userId: "user1",
    });
    expect(result.marked).toBe(2);
    expect(result.hasMore).toBe(false);

    expect(
      await t.query(internal.inbox.unreadCount, { userId: "user1" }),
    ).toBe(0);
  });

  test("markAllRead batches with batchSize", async () => {
    const t = initConvexTest();
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.notifications.createNotification, {
        userId: "user1",
        event: "test",
        title: `${i}`,
        body: `${i}`,
      });
    }

    const result = await t.mutation(internal.inbox.markAllRead, {
      userId: "user1",
      batchSize: 3,
    });
    expect(result.marked).toBe(3);
    expect(result.hasMore).toBe(true);

    const result2 = await t.mutation(internal.inbox.markAllRead, {
      userId: "user1",
      batchSize: 3,
    });
    expect(result2.marked).toBe(2);
    expect(result2.hasMore).toBe(false);
  });

  test("archive excludes from list", async () => {
    const t = initConvexTest();
    const id = await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "Test",
      body: "Test",
    });

    await t.mutation(internal.inbox.archive, {
      userId: "user1",
      notificationId: id,
    });

    const result = await t.query(internal.inbox.list, { userId: "user1" });
    expect(result.notifications).toHaveLength(0);
  });

  test("archive excludes from unread count", async () => {
    const t = initConvexTest();
    const id = await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "Test",
      body: "Test",
    });

    await t.mutation(internal.inbox.archive, {
      userId: "user1",
      notificationId: id,
    });

    expect(await t.query(internal.inbox.unreadCount, { userId: "user1" })).toBe(
      0,
    );
  });

  test("markRead rejects wrong user", async () => {
    const t = initConvexTest();
    const id = await t.mutation(internal.notifications.createNotification, {
      userId: "user1",
      event: "test",
      title: "Test",
      body: "Test",
    });

    await expect(
      t.mutation(internal.inbox.markRead, {
        userId: "user2",
        notificationId: id,
      }),
    ).rejects.toThrow("Notification not found");
  });

  test("pagination with cursor", async () => {
    const t = initConvexTest();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(now + i * 1000);
      await t.mutation(internal.notifications.createNotification, {
        userId: "user1",
        event: "test",
        title: `Notification ${i}`,
        body: `Body ${i}`,
      });
    }

    // First page
    const page1 = await t.query(internal.inbox.list, {
      userId: "user1",
      limit: 3,
    });
    expect(page1.notifications).toHaveLength(3);
    expect(page1.cursor).not.toBeNull();

    // Second page
    const page2 = await t.query(internal.inbox.list, {
      userId: "user1",
      limit: 3,
      cursor: page1.cursor!,
    });
    expect(page2.notifications).toHaveLength(2);
    expect(page2.cursor).toBeNull();
  });
});
