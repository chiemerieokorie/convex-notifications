import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const getOrCreateBatch = internalMutation({
  args: {
    batchKey: v.string(),
    userId: v.string(),
    event: v.string(),
    windowMs: v.number(),
    item: v.any(),
  },
  returns: v.object({
    batchId: v.id("pendingBatches"),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingBatches")
      .withIndex("by_batchKey", (q) => q.eq("batchKey", args.batchKey))
      .first();

    if (existing && !existing.flushed) {
      // Append to existing batch
      await ctx.db.patch(existing._id, {
        items: [...existing.items, args.item],
      });
      return { batchId: existing._id, isNew: false };
    }

    // Create new batch
    const batchId = await ctx.db.insert("pendingBatches", {
      batchKey: args.batchKey,
      userId: args.userId,
      event: args.event,
      items: [args.item],
      windowEndsAt: Date.now() + args.windowMs,
      flushed: false,
    });
    return { batchId, isNew: true };
  },
});

export const flushBatch = internalMutation({
  args: { batchId: v.id("pendingBatches") },
  returns: v.union(
    v.object({
      userId: v.string(),
      event: v.string(),
      items: v.array(v.any()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.flushed) return null;

    await ctx.db.patch(args.batchId, { flushed: true });
    return {
      userId: batch.userId,
      event: batch.event,
      items: batch.items,
    };
  },
});

export const getPendingBatches = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pendingBatches")
      .withIndex("by_flushed_windowEndsAt", (q) =>
        q.eq("flushed", false).lte("windowEndsAt", args.now),
      )
      .collect();
  },
});
