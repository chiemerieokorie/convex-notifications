/**
 * Consumer test: exercises the full consumer API pattern.
 *
 * This file validates that a real consumer can:
 * - Import from "convex-notifications" (main export)
 * - Use ComponentApi from _generated/api with the Notifications class
 * - Define notifications with createNotification + typed templates
 * - Re-export plug-and-play API via notifications.api()
 * - Use notifications.send() with mutation context
 */
import { components } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
import { Notifications, createNotification } from "convex-notifications";
import type { RunMutationCtx } from "convex-notifications";
import { v } from "convex/values";
import type { Auth } from "convex/server";

// Auth resolver
async function getAuthUserId(ctx: { auth: Auth }) {
  return (await ctx.auth.getUserIdentity())?.subject ?? "test-user";
}

// Address resolver
async function getEmailForUser(
  _ctx: RunMutationCtx,
  userId: string,
): Promise<string | null> {
  return `${userId}@example.com`;
}

// Create Notifications client (tests ComponentApi type compatibility)
const notifications = new Notifications(components.notifications, {
  auth: getAuthUserId,
  channels: {
    email: {
      defaultFrom: "test@example.com",
    },
  },
  resolvers: {
    email: getEmailForUser,
  },
});

// Notification definition (tests createNotification + template typing)
const welcomeNotification = createNotification({
  event: "user.welcome",
  dataValidator: v.object({ userName: v.string() }),
  category: "onboarding",
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining.",
    },
    email: {
      subject: (data) => `Welcome, ${data.userName}!`,
      body: (data) => `Hi ${data.userName}, welcome!`,
    },
  },
});

// Re-export plug-and-play API (tests api() return types)
export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
} = notifications.api();

// Send mutation (tests send() type compatibility with mutation context)
export const sendWelcome = mutation({
  args: {
    userId: v.string(),
    data: v.object({ userName: v.string() }),
  },
  handler: async (ctx, args) => {
    return notifications.send(ctx, welcomeNotification, {
      userId: args.userId,
      data: args.data,
    });
  },
});
