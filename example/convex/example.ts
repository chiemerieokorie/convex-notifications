import { components } from "./_generated/api.js";
import { query, mutation } from "./_generated/server.js";
import { Notifications } from "convex-notifications";
import type { NotificationDefinition, RunMutationCtx } from "convex-notifications";
import { v } from "convex/values";
import type { Auth } from "convex/server";

/**
 * ============================================================================
 * CHANNEL CONFIGURATION
 * ============================================================================
 *
 * To enable channel delivery (email, push, SMS), you need to:
 *
 * 1. Register child components in convex.config.ts:
 *
 *    import pushNotifications from "@convex-dev/expo-push-notifications/convex.config.js";
 *    import resend from "@convex-dev/resend/convex.config.js";
 *    import twilio from "@convex-dev/twilio/convex.config.js";
 *
 *    app.use(pushNotifications);
 *    app.use(resend);
 *    app.use(twilio);
 *
 * 2. Run codegen: npx convex dev (or npm run build:codegen)
 *
 * 3. Instantiate the clients and pass them to Notifications:
 *
 *    import { PushNotifications } from "@convex-dev/expo-push-notifications";
 *    import { Resend } from "@convex-dev/resend";
 *    import { Twilio } from "@convex-dev/twilio";
 *
 *    const pushClient = new PushNotifications(components.pushNotifications);
 *    const resendClient = new Resend(components.resend);
 *    const twilioClient = new Twilio(components.twilio, {
 *      defaultFrom: "+1234567890",
 *    });
 *
 *    const notifications = new Notifications(components.notifications, {
 *      // ... other options ...
 *      clients: {
 *        email: resendClient,
 *        push: pushClient,
 *        sms: twilioClient,
 *      },
 *    });
 *
 * 4. Set environment variables:
 *    - RESEND_API_KEY for email delivery
 *    - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN for SMS delivery
 *
 * ============================================================================
 */

// --- Setup ---

async function getAuthUserId(ctx: { auth: Auth }) {
  return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
}

// Example resolver functions
// In a real app, these would query your users table

async function getEmailForUser(
  _ctx: RunMutationCtx,
  userId: string,
): Promise<string | null> {
  // In production, query your users table:
  // const user = await ctx.db.get(userId as Id<"users">);
  // return user?.email ?? null;

  // For demo purposes, return a test email
  return `${userId}@example.com`;
}

async function getPhoneForUser(
  _ctx: RunMutationCtx,
  _userId: string,
): Promise<string | null> {
  // In production, query your users table:
  // const user = await ctx.db.get(userId as Id<"users">);
  // return user?.phone ?? null;

  // For demo purposes, return null (SMS disabled)
  return null;
}

// Create the Notifications client
const notifications = new Notifications(components.notifications, {
  auth: getAuthUserId,

  // Channel configuration
  channels: {
    email: {
      defaultFrom: "notifications@example.com",
      testMode: true,
    },
    push: {
      allowUnregisteredTokens: true,
    },
    sms: {
      defaultFrom: "+10000000000", // Replace with your Twilio phone number
    },
  },

  // Resolvers for user contact information
  resolvers: {
    email: getEmailForUser,
    phone: getPhoneForUser,
  },

  // Child component clients for actual delivery
  // Uncomment after running codegen with child components:
  // clients: {
  //   email: resendClient,
  //   push: pushClient,
  //   sms: twilioClient,
  // },
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
      html: (data) =>
        `<p><strong>${data.commenterName}</strong> replied on "${data.postTitle}".</p>`,
    },
    push: {
      title: (_data) => "New reply",
      body: (data) =>
        `${data.commenterName} replied on "${data.postTitle}"`,
      data: (data) => ({ event: "comment.reply", postTitle: data.postTitle }),
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
      html: (data) =>
        `<h1>Welcome, ${data.userName}!</h1><p>Thanks for joining. Here's how to get started.</p>`,
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

// Push token management
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

// --- Delivery Status ---

export const getDeliveryLogs = query({
  args: {
    notificationId: v.string(),
  },
  handler: (ctx, args) =>
    notifications.getDeliveryLogs(ctx, args.notificationId),
});
