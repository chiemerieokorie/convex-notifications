import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const registerPushToken = internalMutation({
  args: {
    userId: v.string(),
    token: v.string(),
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    deviceId: v.optional(v.string()),
  },
  returns: v.id("pushTokens"),
  handler: async (ctx, args) => {
    // Check if this token already exists
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      // Update the existing token with new user/platform/device info
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        platform: args.platform,
        deviceId: args.deviceId,
      });
      return existing._id;
    }

    // Insert new token
    return await ctx.db.insert("pushTokens", {
      userId: args.userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
    });
  },
});

export const getPushTokens = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("pushTokens"),
      _creationTime: v.number(),
      userId: v.string(),
      token: v.string(),
      platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
      deviceId: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const deletePushToken = internalMutation({
  args: {
    userId: v.string(),
    token: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!existing || existing.userId !== args.userId) {
      return false;
    }

    await ctx.db.delete(existing._id);
    return true;
  },
});
