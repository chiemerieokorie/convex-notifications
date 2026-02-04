/**
 * Internal dispatch functions that use child components for actual delivery.
 *
 * These functions are called from the client's send() method to dispatch
 * notifications via the appropriate child component:
 * - Push notifications via @convex-dev/expo-push-notifications
 * - Email via @convex-dev/resend
 * - SMS via @convex-dev/twilio
 */

import { v } from "convex/values";
import { internalMutation, internalAction } from "./_generated/server.js";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { Resend } from "@convex-dev/resend";
import { Twilio } from "@convex-dev/twilio";
import { components } from "./_generated/api.js";

// Type assertion for child components (resolved after codegen)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const childComponents = components as any;

// Initialize child component clients with string userId type
const pushNotifications = new PushNotifications<string>(childComponents.expoPush);

const resend = new Resend(childComponents.resend, {
  // testMode defaults to true for safety - consumer should configure via env
});

const twilio = new Twilio(childComponents.twilio, {
  // Credentials come from env vars
});

/**
 * Dispatch a push notification via Expo Push Notifications component.
 */
export const dispatchPush = internalMutation({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const result = await pushNotifications.sendPushNotification(ctx, {
        userId: args.userId,
        notification: {
          title: args.title,
          body: args.body,
          data: args.data,
        },
        allowUnregisteredTokens: true,
      });
      return result;
    } catch (error) {
      console.error("[dispatch:push] Error:", error);
      return null;
    }
  },
});

/**
 * Dispatch an email via Resend component.
 */
export const dispatchEmail = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    html: v.optional(v.string()),
    from: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const emailId = await resend.sendEmail(ctx, {
        from: args.from ?? process.env.RESEND_FROM_EMAIL ?? "notifications@example.com",
        to: args.to,
        subject: args.subject,
        text: args.body,
        html: args.html,
      });
      return emailId;
    } catch (error) {
      console.error("[dispatch:email] Error:", error);
      return null;
    }
  },
});

/**
 * Dispatch an SMS via Twilio component.
 * Note: Twilio requires an action context for HTTP calls.
 */
export const dispatchSms = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
    from: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const result = await twilio.sendMessage(ctx, {
        to: args.to,
        body: args.body,
        from: args.from ?? process.env.TWILIO_FROM_NUMBER ?? "",
      });
      return result?.sid ?? null;
    } catch (error) {
      console.error("[dispatch:sms] Error:", error);
      return null;
    }
  },
});
