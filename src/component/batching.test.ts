import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("batching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates new batch with first item", async () => {
    const t = initConvexTest();
    const result = await t.mutation(internal.batching.getOrCreateBatch, {
      batchKey: "comment.reply:user1",
      userId: "user1",
      event: "comment.reply",
      windowMs: 60000,
      item: { commenterName: "Alice" },
    });

    expect(result.isNew).toBe(true);
    expect(result.batchId).toBeDefined();
  });

  test("appends to existing batch", async () => {
    const t = initConvexTest();
    const first = await t.mutation(internal.batching.getOrCreateBatch, {
      batchKey: "comment.reply:user1",
      userId: "user1",
      event: "comment.reply",
      windowMs: 60000,
      item: { commenterName: "Alice" },
    });

    const second = await t.mutation(internal.batching.getOrCreateBatch, {
      batchKey: "comment.reply:user1",
      userId: "user1",
      event: "comment.reply",
      windowMs: 60000,
      item: { commenterName: "Bob" },
    });

    expect(second.isNew).toBe(false);
    expect(second.batchId).toBe(first.batchId);
  });

  test("flushBatch returns items and marks flushed", async () => {
    const t = initConvexTest();
    const { batchId } = await t.mutation(
      internal.batching.getOrCreateBatch,
      {
        batchKey: "test-batch",
        userId: "user1",
        event: "test",
        windowMs: 60000,
        item: { name: "Alice" },
      },
    );

    await t.mutation(internal.batching.getOrCreateBatch, {
      batchKey: "test-batch",
      userId: "user1",
      event: "test",
      windowMs: 60000,
      item: { name: "Bob" },
    });

    const result = await t.mutation(internal.batching.flushBatch, {
      batchId,
    });

    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(2);
    expect(result!.userId).toBe("user1");

    // Second flush returns null (already flushed)
    const result2 = await t.mutation(internal.batching.flushBatch, {
      batchId,
    });
    expect(result2).toBeNull();
  });

  test("getPendingBatches finds ready batches", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    await t.mutation(internal.batching.getOrCreateBatch, {
      batchKey: "batch-1",
      userId: "user1",
      event: "test",
      windowMs: 5000,
      item: { data: 1 },
    });

    // Not yet due
    const before = await t.query(internal.batching.getPendingBatches, {
      now: now + 3000,
    });
    expect(before).toHaveLength(0);

    // Now due
    const after = await t.query(internal.batching.getPendingBatches, {
      now: now + 6000,
    });
    expect(after).toHaveLength(1);
  });
});
