import { components } from "./_generated/api.js";
import { query, mutation } from "./_generated/server.js";
import { Notifications } from "convex-notifications";
import type { NotificationDefinition } from "convex-notifications";
import { v } from "convex/values";
import type { Auth } from "convex/server";

// --- Setup ---

async function getAuthUserId(ctx: { auth: Auth }) {
  return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
}

const notifications = new Notifications(components.notifications, {
  auth: getAuthUserId,
});

// --- Notification Definitions ---

const commentReplyDef: NotificationDefinition<{
  commenterName: string;
  postTitle: string;
}> = {
  event: "comment.reply",
  dataValidator: v.object({
    commenterName: v.string(),
    postTitle: v.string(),
  }),
  category: "social",
  channels: {
    inbox: {
      title: (data) => `${data.commenterName} replied`,
      body: (data) => `New reply on "${data.postTitle}"`,
    },
    email: {
      subject: (data) => `${data.commenterName} replied to your comment`,
      body: (data) =>
        `${data.commenterName} replied on "${data.postTitle}".`,
    },
    push: {
      title: (_data) => "New reply",
      body: (data) =>
        `${data.commenterName} replied on "${data.postTitle}"`,
    },
  },
};

const welcomeDef: NotificationDefinition<{ userName: string }> = {
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  category: "onboarding",
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining. Here's how to get started.",
    },
    email: {
      subject: (data) => `Welcome to the app, ${data.userName}`,
      body: (data) => `Hi ${data.userName}, welcome aboard!`,
    },
  },
};

// --- Exported API ---

export const list = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: (ctx, args) => notifications.list(ctx, args),
});

export const unreadCount = query({
  args: {},
  handler: (ctx) => notifications.unreadCount(ctx),
});

export const markRead = mutation({
  args: { notificationId: v.string() },
  handler: (ctx, args) => notifications.markRead(ctx, args.notificationId),
});

export const markAllRead = mutation({
  args: {},
  handler: (ctx) => notifications.markAllRead(ctx),
});

export const archive = mutation({
  args: { notificationId: v.string() },
  handler: (ctx, args) => notifications.archive(ctx, args.notificationId),
});

export const getPreferences = query({
  args: {},
  handler: (ctx) => notifications.getPreferences(ctx),
});

export const updatePreference = mutation({
  args: {
    level: v.union(
      v.literal("global"),
      v.literal("category"),
      v.literal("event"),
    ),
    key: v.optional(v.string()),
    channel: v.string(),
    enabled: v.boolean(),
  },
  handler: (ctx, args) => notifications.updatePreference(ctx, args),
});

export const registerPushToken = mutation({
  args: {
    token: v.string(),
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    deviceId: v.optional(v.string()),
  },
  handler: (ctx, args) => notifications.registerPushToken(ctx, args),
});

export const getPushTokens = query({
  args: {},
  handler: (ctx) => notifications.getPushTokens(ctx),
});

export const deletePushToken = mutation({
  args: { token: v.string() },
  handler: (ctx, args) => notifications.deletePushToken(ctx, args.token),
});

// --- Send mutations ---

export const sendTestNotification = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({ userName: v.string() }),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.send(ctx, welcomeDef, { userId, data: args.data });
  },
});

export const sendCommentReply = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({
      commenterName: v.string(),
      postTitle: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.send(ctx, commentReplyDef, {
      userId,
      data: args.data,
    });
  },
});
