import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("deduplication", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("blocks duplicate within TTL", async () => {
    const t = initConvexTest();

    await t.mutation(internal.notifications.recordDeduplication, {
      key: "test-key",
      ttlSeconds: 3600,
    });

    const isDuplicate = await t.query(
      internal.notifications.checkDeduplication,
      { key: "test-key" },
    );
    expect(isDuplicate).toBe(true);
  });

  test("allows after TTL expires", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    await t.mutation(internal.notifications.recordDeduplication, {
      key: "test-key",
      ttlSeconds: 1,
    });

    vi.setSystemTime(now + 2000);

    const isDuplicate = await t.query(
      internal.notifications.checkDeduplication,
      { key: "test-key" },
    );
    expect(isDuplicate).toBe(false);
  });

  test("different keys are independent", async () => {
    const t = initConvexTest();

    await t.mutation(internal.notifications.recordDeduplication, {
      key: "key-a",
      ttlSeconds: 3600,
    });

    const isDuplicate = await t.query(
      internal.notifications.checkDeduplication,
      { key: "key-b" },
    );
    expect(isDuplicate).toBe(false);
  });
});
