import { components } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
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

// --- Exported API (using the new api() method for plug-and-play exports) ---

export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
} = notifications.api();

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
