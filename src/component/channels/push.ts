/**
 * Push notification channel adapter using Expo.
 *
 * This adapter handles mobile push notification delivery through
 * Expo Push Notification Service. When the expo-push-notifications
 * child component is integrated, this will be updated to use
 * the component's dispatch functions.
 */

import type {
  ChannelAdapter,
  DispatchResult,
  RenderedPush,
  ChannelConfig,
} from "./types.js";

/**
 * Push notification channel adapter
 */
export class PushAdapter implements ChannelAdapter<RenderedPush> {
  readonly name = "push" as const;
  private config: ChannelConfig["push"];

  constructor(config?: ChannelConfig["push"]) {
    this.config = config;
  }

  /**
   * Dispatch a push notification to the recipient.
   *
   * @param address - Expo push token (ExponentPushToken[xxx])
   * @param content - Rendered push content (title, body, optional data)
   * @returns Dispatch result
   */
  async dispatch(
    address: string,
    content: RenderedPush,
  ): Promise<DispatchResult> {
    // Validate Expo push token format
    if (!this.isValidExpoPushToken(address)) {
      return {
        status: "failed",
        error: `Invalid Expo push token: ${address}`,
      };
    }

    // TODO: Integrate with expo-push-notifications child component
    // When expo-push-notifications component is available, replace this with:
    // const result = await ctx.runAction(components.expoPush.send, {
    //   to: address,
    //   title: content.title,
    //   body: content.body,
    //   data: content.data,
    // });

    console.log(`[push] dispatch to ${address}:`, {
      title: content.title,
      bodyLength: content.body.length,
      hasData: !!content.data,
    });

    // Return sent status (actual delivery confirmation comes from receipts)
    return {
      status: "sent",
    };
  }

  /**
   * Validate Expo push token format
   * Expo tokens are in the format: ExponentPushToken[xxx] or ExpoPushToken[xxx]
   */
  private isValidExpoPushToken(token: string): boolean {
    return (
      token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken[")
    );
  }
}

/**
 * Create a push adapter instance
 */
export function createPushAdapter(config?: ChannelConfig["push"]): PushAdapter {
  return new PushAdapter(config);
}
