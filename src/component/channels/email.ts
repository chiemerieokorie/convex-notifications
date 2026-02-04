/**
 * Email channel adapter using Resend.
 *
 * This adapter handles email delivery through the Resend service.
 * When the resend child component is integrated, this will be updated
 * to use the component's dispatch functions.
 */

import type {
  ChannelAdapter,
  DispatchResult,
  RenderedEmail,
  ChannelConfig,
} from "./types.js";

/**
 * Email channel adapter
 */
export class EmailAdapter implements ChannelAdapter<RenderedEmail> {
  readonly name = "email" as const;
  private config: ChannelConfig["email"];

  constructor(config?: ChannelConfig["email"]) {
    this.config = config;
  }

  /**
   * Dispatch an email to the recipient.
   *
   * @param address - Recipient email address
   * @param content - Rendered email content (subject, body, optional html)
   * @returns Dispatch result
   */
  async dispatch(
    address: string,
    content: RenderedEmail,
  ): Promise<DispatchResult> {
    // Validate email address format
    if (!this.isValidEmail(address)) {
      return {
        status: "failed",
        error: `Invalid email address: ${address}`,
      };
    }

    // TODO: Integrate with resend child component
    // When resend component is available, replace this with:
    // const result = await ctx.runAction(components.resend.send, {
    //   from: this.config?.from ?? "notifications@example.com",
    //   to: address,
    //   subject: content.subject,
    //   text: content.body,
    //   html: content.html,
    // });

    console.log(`[email] dispatch to ${address}:`, {
      subject: content.subject,
      bodyLength: content.body.length,
      hasHtml: !!content.html,
    });

    // Return sent status (actual delivery confirmation comes from webhooks)
    return {
      status: "sent",
    };
  }

  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Create an email adapter instance
 */
export function createEmailAdapter(
  config?: ChannelConfig["email"],
): EmailAdapter {
  return new EmailAdapter(config);
}
