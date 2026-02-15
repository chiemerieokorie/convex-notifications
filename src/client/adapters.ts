/**
 * Channel adapters for dispatching notifications through child components.
 *
 * These adapters wrap the child component clients (expo-push-notifications,
 * resend, twilio) and provide a unified interface for the Notifications class.
 */

import type { PushNotifications } from "@convex-dev/expo-push-notifications";
import type { Resend } from "@convex-dev/resend";
import type { Twilio } from "@convex-dev/twilio";
import type { MutationCtx, ActionCtx, DeliveryResult } from "./types.js";

// Re-export types for consumers
export type { PushNotifications } from "@convex-dev/expo-push-notifications";
export type { Resend } from "@convex-dev/resend";
export type { Twilio } from "@convex-dev/twilio";

/**
 * Rendered content for each channel type
 */
export type RenderedEmail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
};

export type RenderedPush = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type RenderedSms = {
  from: string;
  to: string;
  body: string;
};

/**
 * Email adapter using the Resend component
 */
export async function dispatchEmail(
  ctx: MutationCtx,
  resend: Resend,
  rendered: RenderedEmail,
): Promise<DeliveryResult> {
  try {
    const emailId = await resend.sendEmail(ctx, {
      from: rendered.from,
      to: rendered.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.body,
    });

    return {
      channel: "email",
      status: "sent",
      externalId: emailId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      channel: "email",
      status: "failed",
      reason: errorMessage,
    };
  }
}

/**
 * Push notification adapter using the Expo Push Notifications component
 */
export async function dispatchPush(
  ctx: MutationCtx,
  pushNotifications: PushNotifications<string>,
  rendered: RenderedPush,
  allowUnregisteredTokens: boolean = true,
): Promise<DeliveryResult> {
  try {
    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: rendered.userId,
      notification: {
        title: rendered.title,
        body: rendered.body,
        data: rendered.data,
      },
      allowUnregisteredTokens,
    });

    if (notificationId === null) {
      return {
        channel: "push",
        status: "skipped",
        reason: "User has paused notifications or no token registered",
      };
    }

    return {
      channel: "push",
      status: "sent",
      externalId: notificationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      channel: "push",
      status: "failed",
      reason: errorMessage,
    };
  }
}

/**
 * SMS adapter using the Twilio component.
 * Note: Twilio requires action context, so this must be called from an action.
 */
export async function dispatchSms(
  ctx: ActionCtx,
  twilio: Twilio<{ defaultFrom: string }>,
  rendered: RenderedSms,
): Promise<DeliveryResult> {
  try {
    const result = await twilio.sendMessage(ctx, {
      from: rendered.from,
      to: rendered.to,
      body: rendered.body,
    });

    return {
      channel: "sms",
      status: "sent",
      externalId: result.sid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      channel: "sms",
      status: "failed",
      reason: errorMessage,
    };
  }
}

/**
 * Check if the context has action capabilities (runAction)
 */
export function isActionContext(
  ctx: MutationCtx | ActionCtx,
): ctx is ActionCtx {
  return "runAction" in ctx;
}
