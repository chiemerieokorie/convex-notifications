import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("notifications example", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("send welcome notification", async () => {
    const t = initConvexTest();
    const notificationId = await t.mutation(api.example.sendTestNotification, {
      userId: "user1",
      data: { userName: "Alice" },
    });
    expect(notificationId).toBeDefined();
  });

  test("send comment reply notification", async () => {
    const t = initConvexTest();
    const notificationId = await t.mutation(api.example.sendCommentReply, {
      userId: "user1",
      data: {
        commenterName: "Alice",
        postTitle: "Test Post",
      },
    });
    expect(notificationId).toBeDefined();
  });
});
