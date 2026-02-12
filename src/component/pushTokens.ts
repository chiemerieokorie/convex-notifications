import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

export const registerPushToken = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
    token: v.string(),
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    deviceId: v.optional(v.string()),
  },
  returns: v.id("pushTokens"),
  handler: async (ctx, args) => {
    // Check if this token already exists
    const existing = args.tenantId !== undefined
      ? await ctx.db
          .query("pushTokens")
          .withIndex("by_tenantId_token", (q) =>
            q.eq("tenantId", args.tenantId).eq("token", args.token),
          )
          .first()
      : await ctx.db
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
      tenantId: args.tenantId,
      userId: args.userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
    });
  },
});

export const getPushTokens = internalQuery({
  args: {
    tenantId: v.optional(v.string()),
    userId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("pushTokens"),
      _creationTime: v.number(),
      tenantId: v.optional(v.string()),
      userId: v.string(),
      token: v.string(),
      platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
      deviceId: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const q = args.tenantId !== undefined
      ? ctx.db
          .query("pushTokens")
          .withIndex("by_tenantId_userId", (q) =>
            q.eq("tenantId", args.tenantId).eq("userId", args.userId),
          )
      : ctx.db
          .query("pushTokens")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId));
    return await q.collect();
  },
});

export const deletePushToken = internalMutation({
  args: {
    tenantId: v.optional(v.string()),
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
