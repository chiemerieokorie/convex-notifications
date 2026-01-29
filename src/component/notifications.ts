import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const createNotification = internalMutation({
  args: {
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    actionUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
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
      actionUrl: args.actionUrl,
      imageUrl: args.imageUrl,
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
