/**
 * SMS channel adapter using Twilio.
 *
 * This adapter handles SMS delivery through the Twilio service.
 * When the twilio child component is integrated, this will be updated
 * to use the component's dispatch functions.
 */

import type {
  ChannelAdapter,
  DispatchResult,
  RenderedSms,
  ChannelConfig,
} from "./types.js";

/**
 * SMS channel adapter
 */
export class SmsAdapter implements ChannelAdapter<RenderedSms> {
  readonly name = "sms" as const;
  private config: ChannelConfig["sms"];

  constructor(config?: ChannelConfig["sms"]) {
    this.config = config;
  }

  /**
   * Dispatch an SMS to the recipient.
   *
   * @param address - Recipient phone number (E.164 format recommended)
   * @param content - Rendered SMS content (body)
   * @returns Dispatch result
   */
  async dispatch(
    address: string,
    content: RenderedSms,
  ): Promise<DispatchResult> {
    // Validate phone number format
    if (!this.isValidPhoneNumber(address)) {
      return {
        status: "failed",
        error: `Invalid phone number: ${address}`,
      };
    }

    // Validate SMS body length (standard SMS is 160 chars, concatenated up to 1600)
    if (content.body.length > 1600) {
      return {
        status: "failed",
        error: `SMS body exceeds maximum length of 1600 characters`,
      };
    }

    // TODO: Integrate with twilio child component
    // When twilio component is available, replace this with:
    // const result = await ctx.runAction(components.twilio.sendSms, {
    //   from: this.config?.from,
    //   to: address,
    //   body: content.body,
    // });

    console.log(`[sms] dispatch to ${address}:`, {
      bodyLength: content.body.length,
      segments: Math.ceil(content.body.length / 160),
    });

    // Return sent status (actual delivery confirmation comes from webhooks)
    return {
      status: "sent",
    };
  }

  /**
   * Validate phone number format
   * Accepts E.164 format (+1234567890) or common variations
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-().]/g, "");
    // Check for E.164 format or 10+ digit number
    return /^\+?[1-9]\d{9,14}$/.test(cleaned);
  }
}

/**
 * Create an SMS adapter instance
 */
export function createSmsAdapter(config?: ChannelConfig["sms"]): SmsAdapter {
  return new SmsAdapter(config);
}
