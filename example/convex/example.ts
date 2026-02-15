import { components } from "./_generated/api.js";
import { mutation, internalMutation } from "./_generated/server.js";
import { Notifications, defineEvent } from "convex-notifications";
import { v } from "convex/values";
import type { Auth } from "convex/server";

// =============================================================================
// 1. Create the Notifications client — no auth here, just channel config.
// =============================================================================

const notifications = new Notifications(components.notifications, {
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
      defaultFrom: "+10000000000",
    },
  },

  // Resolvers for user contact information
  resolvers: {
    email: async (ctx, userId) => {
      // In production: const user = await ctx.db.get(userId); return user?.email;
      return `${userId}@example.com`;
    },
    phone: async (_ctx, _userId) => null, // SMS disabled in example
  },

  // Default: channels are enabled unless user opts out
  defaultPreferenceMode: "opt-out",
});

// =============================================================================
// 2. Define notification events — one per file in a real app.
// =============================================================================

const welcomeNotification = defineEvent({
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
        `<h1>Welcome, ${data.userName}!</h1><p>Thanks for joining.</p>`,
    },
  },
});

const commentReplyNotification = defineEvent({
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
      title: () => "New reply",
      body: (data) =>
        `${data.commenterName} replied on "${data.postTitle}"`,
    },
  },
});

/** OTP — marked as `required` so it always sends, even if user disabled SMS. */
const otpNotification = defineEvent({
  event: "auth.otp",
  dataValidator: v.object({ code: v.string(), phoneNumber: v.string() }),
  category: "auth",
  required: true,
  channels: {
    inbox: {
      title: () => "Verification Code",
      body: (data) => `Your code is ${data.code}`,
    },
    sms: {
      body: (data) => `Your verification code is ${data.code}. Do not share.`,
    },
  },
});

/** Security alert — `required` bypasses all preferences. */
const securityAlertNotification = defineEvent({
  event: "security.alert",
  dataValidator: v.object({
    alertType: v.string(),
    details: v.string(),
  }),
  category: "security",
  required: true,
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

const reminderNotification = defineEvent({
  event: "reminder",
  dataValidator: v.object({ title: v.string(), message: v.string() }),
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

// =============================================================================
// 3. Export the pre-built API — auth injected here.
// =============================================================================

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
  registerPushToken,
  getPushTokens,
  deletePushToken,
  getDeliveryLogs,
} = notifications.api({
  auth: getAuthUserId,
});

// =============================================================================
// 4. Send mutations — just call notifications.send() directly.
//    No wrapper internalMutation needed for simple cases.
// =============================================================================

export const sendTestNotification = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({ userName: v.string() }),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    return notifications.send(ctx, welcomeNotification, {
      userId,
      data: args.data,
    });
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

/**
 * Send an OTP — this is the improved DX.
 *
 * Before: Required casting to `any`, running raw queries to find the user,
 *         and dispatching through a separate internalMutation.
 *
 * Now: Just call send() with the userId and data. Done.
 */
export const sendOtp = internalMutation({
  args: {
    userId: v.string(),
    code: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return notifications.send(ctx, otpNotification, {
      userId: args.userId,
      data: { code: args.code, phoneNumber: args.phoneNumber },
    });
  },
});

export const sendSecurityAlert = internalMutation({
  args: {
    userId: v.string(),
    alertType: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    return notifications.send(ctx, securityAlertNotification, {
      userId: args.userId,
      data: { alertType: args.alertType, details: args.details },
    });
  },
});

// =============================================================================
// 5. sendMany() — notify multiple users at once, exclude the actor.
// =============================================================================

export const sendReplyToSubscribers = mutation({
  args: {
    subscriberIds: v.array(v.string()),
    data: v.object({
      commenterName: v.string(),
      postTitle: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const actor = await getAuthUserId(ctx);
    return notifications.sendMany(ctx, commentReplyNotification, {
      userIds: args.subscriberIds,
      actor, // Don't notify the person who wrote the reply
      data: args.data,
    });
  },
});

// =============================================================================
// 6. Schedule + cancel — accept Date objects, not just timestamps.
// =============================================================================

export const scheduleReminder = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({ title: v.string(), message: v.string() }),
    scheduledFor: v.number(),
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

export const cancelScheduledNotification = mutation({
  args: { scheduledNotificationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    return notifications.cancel(ctx, args.scheduledNotificationId, userId);
  },
});

// =============================================================================
// 7. Deduplication — returns a discriminated union, not an exception.
// =============================================================================

export const sendWithDeduplication = mutation({
  args: {
    userId: v.optional(v.string()),
    data: v.object({
      commenterName: v.string(),
      postTitle: v.string(),
    }),
    dedupe: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    const result = await notifications.send(ctx, commentReplyNotification, {
      userId,
      data: args.data,
      dedupe: args.dedupe,
    });

    // Result is a discriminated union — no try/catch needed
    if (result.status === "deduplicated") {
      console.log("Duplicate suppressed:", result.dedupe);
      return result;
    }

    console.log("Sent:", result.notificationId, result.deliveries);
    return result;
  },
});
