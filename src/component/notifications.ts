import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const createNotification = internalMutation({
  args: {
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    transactional: v.optional(v.boolean()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      event: args.event,
      title: args.title,
      body: args.body,
      data: args.data,
      transactional: args.transactional,
    });
  },
});

export const checkDeduplication = internalQuery({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("deduplication")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!entry) return false;
    return entry.expiresAt > Date.now();
  },
});

export const recordDeduplication = internalMutation({
  args: {
    key: v.string(),
    ttlSeconds: v.number(),
  },
  returns: v.id("deduplication"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("deduplication", {
      key: args.key,
      expiresAt: Date.now() + args.ttlSeconds * 1000,
    });
  },
});

/**
 * Clean up expired deduplication keys.
 * This is called by a cron job to prevent the table from growing indefinitely.
 */
export const cleanupExpiredDeduplication = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();

    // Query expired entries using the expiresAt index
    const expired = await ctx.db
      .query("deduplication")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(batchSize + 1);

    const hasMore = expired.length > batchSize;
    const toDelete = expired.slice(0, batchSize);

    // Delete in batch
    for (const entry of toDelete) {
      await ctx.db.delete(entry._id);
    }

    return {
      deleted: toDelete.length,
      hasMore,
    };
  },
});
