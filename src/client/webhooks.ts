import { httpActionGeneric } from "convex/server";
import type { HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

// --- Delivery event types ---

export type DeliveryEventType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "sms.delivered"
  | "sms.failed"
  | "push.delivered"
  | "push.failed";

export type DeliveryEventHandler = (
  ctx: any,
  event: any,
) => Promise<void>;

export type DeliveryEventHandlers = Partial<
  Record<DeliveryEventType, DeliveryEventHandler>
>;

// --- Status mappers ---

function mapResendStatus(
  eventType: string,
): "delivered" | "failed" | "sent" {
  switch (eventType) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
    case "email.complained":
      return "failed";
    default:
      return "sent";
  }
}

function mapTwilioStatus(
  status: string | null,
): "delivered" | "failed" | "sent" {
  switch (status) {
    case "delivered":
      return "delivered";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return "sent";
  }
}

// --- Registration ---

export type WebhookOptions = {
  resend?: {
    path?: string;
    webhookSecret?: string;
    events?: DeliveryEventHandlers;
  };
  twilio?: {
    path?: string;
    authToken?: string;
    events?: DeliveryEventHandlers;
  };
};

/**
 * Register HTTP webhook routes for delivery status tracking.
 * Follows the same pattern as `@convex-dev/stripe`'s `registerRoutes()`.
 *
 * ```ts
 * // convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { registerDeliveryWebhooks } from "convex-notifications/webhooks";
 * import { components } from "./_generated/api";
 *
 * const http = httpRouter();
 * registerDeliveryWebhooks(http, components.notifications, {
 *   resend: {
 *     webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
 *     events: {
 *       "email.bounced": async (_ctx, event) => {
 *         console.log("Bounced:", event);
 *       },
 *     },
 *   },
 * });
 * export default http;
 * ```
 */
export function registerDeliveryWebhooks(
  http: HttpRouter,
  component: ComponentApi,
  options: WebhookOptions,
) {
  if (options.resend) {
    const path = options.resend.path ?? "/notifications/resend/webhook";
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const body = await request.json();
        const eventType = body.type as string;

        // Update delivery log if deliveryLogId is in tags
        const deliveryLogId = body.data?.tags?.deliveryLogId;
        if (deliveryLogId) {
          await ctx.runMutation(
            component.delivery.updateDeliveryStatus,
            {
              deliveryLogId,
              status: mapResendStatus(eventType),
              sentAt: Date.now(),
            },
          );
        }

        // Call consumer handler
        const handler =
          options.resend?.events?.[eventType as DeliveryEventType];
        if (handler) await handler(ctx, body);

        return new Response(null, { status: 200 });
      }),
    });
  }

  if (options.twilio) {
    const path = options.twilio.path ?? "/notifications/twilio/status";
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const params = new URLSearchParams(await request.text());
        const status = params.get("MessageStatus");
        const deliveryLogId = params.get("deliveryLogId");

        if (deliveryLogId) {
          await ctx.runMutation(
            component.delivery.updateDeliveryStatus,
            {
              deliveryLogId,
              status: mapTwilioStatus(status),
            },
          );
        }

        const handler =
          options.twilio?.events?.[
            `sms.${status === "delivered" ? "delivered" : "failed"}` as DeliveryEventType
          ];
        if (handler) {
          await handler(ctx, {
            status,
            sid: params.get("MessageSid"),
          });
        }

        return new Response(null, { status: 200 });
      }),
    });
  }
}
