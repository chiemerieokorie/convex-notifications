import type { ChannelAdapter, RenderedMessage } from "./types.js";

export type { ChannelAdapter, RenderedMessage } from "./types.js";

/**
 * Email adapter for Resend.
 *
 * Dispatches emails via the Resend API. Must be called from an action context.
 */
export class ResendAdapter implements ChannelAdapter {
  channel = "email";

  constructor(
    private config: {
      apiKey: string;
      from: string;
    },
  ) {}

  render(
    template: {
      subject: (data: any) => string;
      body: (data: any) => string;
      html?: (data: any) => string;
    },
    data: any,
  ): RenderedMessage {
    return {
      subject: template.subject(data),
      body: template.body(data),
      ...(template.html ? { html: template.html(data) } : {}),
      from: this.config.from,
    };
  }

  async dispatch(
    address: string,
    rendered: RenderedMessage,
  ): Promise<string | void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: rendered.from,
        to: address,
        subject: rendered.subject,
        html: rendered.html ?? rendered.body,
      }),
    });
    const result = (await res.json()) as { id?: string };
    return result.id;
  }
}

/**
 * Push notification adapter for Expo.
 *
 * Dispatches push notifications via the Expo Push API. Must be called from an action context.
 */
export class ExpoAdapter implements ChannelAdapter {
  channel = "push";

  constructor(
    private config: {
      accessToken?: string;
    } = {},
  ) {}

  render(
    template: {
      title: (data: any) => string;
      body: (data: any) => string;
    },
    data: any,
  ): RenderedMessage {
    return {
      title: template.title(data),
      body: template.body(data),
    };
  }

  async dispatch(
    address: string,
    rendered: RenderedMessage,
  ): Promise<string | void> {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.accessToken
          ? { Authorization: `Bearer ${this.config.accessToken}` }
          : {}),
      },
      body: JSON.stringify({
        to: address,
        title: rendered.title,
        body: rendered.body,
      }),
    });
    const result = (await res.json()) as { data?: { id?: string } };
    return result.data?.id;
  }
}

/**
 * SMS adapter for Twilio.
 *
 * Dispatches SMS messages via the Twilio API. Must be called from an action context.
 */
export class TwilioAdapter implements ChannelAdapter {
  channel = "sms";

  constructor(
    private config: {
      accountSid: string;
      authToken: string;
      from: string;
    },
  ) {}

  render(
    template: { body: (data: any) => string },
    data: any,
  ): RenderedMessage {
    return {
      body: template.body(data),
      from: this.config.from,
    };
  }

  async dispatch(
    address: string,
    rendered: RenderedMessage,
  ): Promise<string | void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.config.accountSid}:${this.config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: rendered.from,
        To: address,
        Body: rendered.body,
      }),
    });
    const result = (await res.json()) as { sid?: string };
    return result.sid;
  }
}
