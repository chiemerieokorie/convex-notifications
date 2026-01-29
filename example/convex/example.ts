import { components } from "./_generated/api.js";
import {
  createNotificationsApi,
  createNotification,
} from "convex-notifications";
import { v } from "convex/values";
import { Auth } from "convex/server";

// --- API Setup ---

async function getAuthUserId(ctx: { auth: Auth }) {
  return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
}

export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
} = createNotificationsApi(components.notifications, {
  auth: getAuthUserId,
});

// --- Notification Events ---

export const commentReplyNotification = createNotification(
  components.notifications,
  {
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
  },
);

export const welcomeNotification = createNotification(
  components.notifications,
  {
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
  },
);

// --- Re-export send mutations for the example app ---

export const sendTestNotification = welcomeNotification.send;
export const sendCommentReply = commentReplyNotification.send;
