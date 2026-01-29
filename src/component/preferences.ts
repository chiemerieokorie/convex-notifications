import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const getPreferences = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const updatePreference = internalMutation({
  args: {
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
    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_userId_level_key", (q) =>
        q.eq("userId", args.userId).eq("level", args.level).eq("key", args.key),
      )
      .collect();

    const match = existing.find((p) => p.channel === args.channel);

    if (match) {
      await ctx.db.patch(match._id, { enabled: args.enabled });
      return match._id;
    }

    return await ctx.db.insert("preferences", {
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
    userId: v.string(),
    event: v.string(),
    category: v.optional(v.string()),
    channels: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const allPrefs = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

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
