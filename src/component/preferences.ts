import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

const preferenceValidator = v.object({
  _id: v.id("preferences"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  userId: v.string(),
  level: v.union(v.literal("global"), v.literal("category"), v.literal("event")),
  key: v.optional(v.string()),
  channel: v.string(),
  enabled: v.boolean(),
});

export const getPreferences = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
  },
  returns: v.array(preferenceValidator),
  handler: async (ctx, args) => {
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("preferences")
          .withIndex("by_tenantId_userId", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId),
          )
      : ctx.db
          .query("preferences")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId));
    return await q.collect();
  },
});

export const updatePreference = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    level: v.union(
      v.literal("global"),
      v.literal("category"),
      v.literal("event"),
    ),
    key: v.optional(v.string()),
    channel: v.string(),
    enabled: v.boolean(),
  },
  returns: v.id("preferences"),
  handler: async (ctx, args) => {
    // Find existing preference
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("preferences")
          .withIndex("by_tenantId_userId_level_key", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId).eq("level", args.level).eq("key", args.key),
          )
      : ctx.db
          .query("preferences")
          .withIndex("by_userId_level_key", (q) =>
            q.eq("userId", args.userId).eq("level", args.level).eq("key", args.key),
          );
    const existing = await q.collect();

    const match = existing.find((p) => p.channel === args.channel);

    if (match) {
      await ctx.db.patch(match._id, { enabled: args.enabled });
      return match._id;
    }

    return await ctx.db.insert("preferences", {
      tenantId: args.tenantId,
      userId: args.userId,
      level: args.level,
      key: args.key,
      channel: args.channel,
      enabled: args.enabled,
    });
  },
});

export const resolvePreferences = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    event: v.string(),
    category: v.optional(v.string()),
    channels: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("preferences")
          .withIndex("by_tenantId_userId", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId),
          )
      : ctx.db
          .query("preferences")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId));
    const allPrefs = await q.collect();

    const enabled: string[] = [];

    for (const channel of args.channels) {
      // 1. Event-level (most specific)
      const eventPref = allPrefs.find(
        (p) =>
          p.level === "event" && p.key === args.event && p.channel === channel,
      );
      if (eventPref !== undefined) {
        if (eventPref.enabled) enabled.push(channel);
        continue;
      }

      // 2. Category-level
      if (args.category !== undefined) {
        const categoryPref = allPrefs.find(
          (p) =>
            p.level === "category" &&
            p.key === args.category &&
            p.channel === channel,
        );
        if (categoryPref !== undefined) {
          if (categoryPref.enabled) enabled.push(channel);
          continue;
        }
      }

      // 3. Global-level
      const globalPref = allPrefs.find(
        (p) => p.level === "global" && p.channel === channel,
      );
      if (globalPref !== undefined) {
        if (globalPref.enabled) enabled.push(channel);
        continue;
      }

      // 4. Default: enabled
      enabled.push(channel);
    }

    return enabled;
  },
});
