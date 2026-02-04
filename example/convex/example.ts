import { components } from "./_generated/api.js";
import { query, mutation } from "./_generated/server.js";
import { Notifications, createNotification } from "convex-notifications";
import type { RunMutationCtx } from "convex-notifications";
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

// --- Notification Definitions (using createNotification helper) ---

/**
 * Comment reply notification - sent when someone replies to a user's comment.
 */
const commentReplyNotification = createNotification({
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
      title: () => "New reply",
      body: (data) =>
        `${data.commenterName} replied on "${data.postTitle}"`,
      data: (data) => ({ event: "comment.reply", postTitle: data.postTitle }),
    },
  },
});

/**
 * Welcome notification - sent when a new user signs up.
 */
const welcomeNotification = createNotification({
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
});

/**
 * Reminder notification - example of a scheduled notification.
 */
const reminderNotification = createNotification({
  event: "reminder",
  dataValidator: v.object({
    title: v.string(),
    message: v.string(),
  }),
  category: "reminders",
  channels: {
    inbox: {
      title: (data) => data.title,
      body: (data) => data.message,
    },
    push: {
      title: (data) => data.title,
      body: (data) => data.message,
    },
  },
});

// --- Exported API (using the new api() method for plug-and-play exports) ---

export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
  registerPushToken,
  getPushTokens,
  deletePushToken,
  getDeliveryLogs,
} = notifications.api();

// --- Send mutations ---

export const sendTestNotification = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({ userName: v.string() }),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.send(ctx, welcomeNotification, { userId, data: args.data });
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
    return notifications.send(ctx, commentReplyNotification, {
      userId,
      data: args.data,
    });
  },
});

// --- Scheduled Notifications ---

/**
 * Schedule a reminder notification for the future.
 */
export const scheduleReminder = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({
      title: v.string(),
      message: v.string(),
    }),
    scheduledFor: v.number(), // Unix timestamp in milliseconds
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.schedule(ctx, reminderNotification, {
      userId,
      data: args.data,
      scheduledFor: args.scheduledFor,
    });
  },
});

/**
 * Cancel a scheduled notification.
 */
export const cancelScheduledNotification = mutation({
  args: {
    scheduledNotificationId: v.string(),
  },
  handler: async (ctx, args) => {
    return notifications.cancelScheduled(ctx, args.scheduledNotificationId);
  },
});

/**
 * Get scheduled notifications for the current user.
 */
export const getScheduledNotifications = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    return notifications.getScheduledNotifications(ctx, {
      status: args.status,
    });
  },
});

// --- Transactional Notifications ---

/**
 * Send a transactional notification (bypasses user preferences).
 * Use for security alerts, password resets, etc.
 */
export const sendSecurityAlert = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({
      alertType: v.string(),
      details: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));

    // Create a transactional security alert
    const securityAlert = createNotification({
      event: "security.alert",
      dataValidator: v.object({
        alertType: v.string(),
        details: v.string(),
      }),
      category: "security",
      channels: {
        inbox: {
          title: (data) => `Security Alert: ${data.alertType}`,
          body: (data) => data.details,
        },
        email: {
          subject: (data) => `[Security Alert] ${data.alertType}`,
          body: (data) => `A security event has occurred: ${data.details}`,
        },
      },
    });

    return notifications.send(ctx, securityAlert, {
      userId,
      data: args.data,
      transactional: true, // Bypasses user preferences
    });
  },
});

// --- Deduplication Example ---

/**
 * Send a notification with deduplication to prevent spam.
 */
export const sendWithDeduplication = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({
      commenterName: v.string(),
      postTitle: v.string(),
    }),
    deduplicationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.send(ctx, commentReplyNotification, {
      userId,
      data: args.data,
      deduplicationKey: args.deduplicationKey,
      deduplicationTtlSeconds: 3600, // 1 hour
    });
  },
});
