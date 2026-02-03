/**
 * Channel dispatcher - manages channel adapters and routes notifications.
 *
 * The dispatcher:
 * 1. Maintains a registry of channel adapters
 * 2. Dispatches rendered content to the appropriate channel
 * 3. Returns dispatch results for delivery log tracking
 */

import type {
  ChannelName,
  ChannelConfig,
  DispatchResult,
  RenderedEmail,
  RenderedPush,
  RenderedSms,
} from "./types.js";
import { EmailAdapter } from "./email.js";
import { PushAdapter } from "./push.js";
import { SmsAdapter } from "./sms.js";

/**
 * Rendered content for a specific channel
 */
export type ChannelContent = {
  email: RenderedEmail;
  push: RenderedPush;
  sms: RenderedSms;
  inbox: never; // Inbox is handled separately via the notifications table
};

/**
 * Channel dispatcher manages all channel adapters and routes dispatches
 */
export class ChannelDispatcher {
  private emailAdapter: EmailAdapter;
  private pushAdapter: PushAdapter;
  private smsAdapter: SmsAdapter;

  constructor(config?: ChannelConfig) {
    this.emailAdapter = new EmailAdapter(config?.email);
    this.pushAdapter = new PushAdapter(config?.push);
    this.smsAdapter = new SmsAdapter(config?.sms);
  }

  /**
   * Dispatch content to a channel.
   *
   * @param channel - Target channel name
   * @param address - Recipient address (email, phone, push token)
   * @param content - Rendered content for the channel
   * @returns Dispatch result with status
   */
  async dispatch<T extends Exclude<ChannelName, "inbox">>(
    channel: T,
    address: string,
    content: ChannelContent[T],
  ): Promise<DispatchResult> {
    switch (channel) {
      case "email":
        return this.emailAdapter.dispatch(address, content as RenderedEmail);
      case "push":
        return this.pushAdapter.dispatch(address, content as RenderedPush);
      case "sms":
        return this.smsAdapter.dispatch(address, content as RenderedSms);
      default: {
        const _exhaustive: never = channel;
        return {
          status: "failed",
          error: `Unknown channel: ${channel}`,
        };
      }
    }
  }

  /**
   * Check if a channel is supported
   */
  isSupported(channel: string): channel is Exclude<ChannelName, "inbox"> {
    return channel === "email" || channel === "push" || channel === "sms";
  }

  /**
   * Get the adapter for a specific channel
   */
  getAdapter(channel: ChannelName) {
    switch (channel) {
      case "email":
        return this.emailAdapter;
      case "push":
        return this.pushAdapter;
      case "sms":
        return this.smsAdapter;
      default:
        return null;
    }
  }
}

/**
 * Create a channel dispatcher instance
 */
export function createDispatcher(config?: ChannelConfig): ChannelDispatcher {
  return new ChannelDispatcher(config);
}

/**
 * Default dispatcher instance (uses no config, for basic usage)
 */
let defaultDispatcher: ChannelDispatcher | null = null;

/**
 * Get or create the default dispatcher instance
 */
export function getDefaultDispatcher(): ChannelDispatcher {
  if (!defaultDispatcher) {
    defaultDispatcher = new ChannelDispatcher();
  }
  return defaultDispatcher;
}
