import type { Auth } from "convex/server";
import type { Validator } from "convex/values";

export type NotificationsOptions = {
  auth: (ctx: { auth: Auth }) => Promise<string>;
  resolvers?: {
    email?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
    phone?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
    pushToken?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
  };
};

export type InboxTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
};

export type EmailTemplate<T> = {
  subject: (data: T) => string;
  /** Plain text body for email clients that don't support HTML */
  body: (data: T) => string;
  /**
   * Optional HTML body for rich email content.
   * Use with React Email: `html: (data) => render(<WelcomeEmail name={data.name} />)`
   */
  html?: (data: T) => string | Promise<string>;
};

export type PushTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
};

export type SmsTemplate<T> = {
  body: (data: T) => string;
};

export type ChannelTemplates<T> = {
  inbox?: InboxTemplate<T>;
  email?: EmailTemplate<T>;
  push?: PushTemplate<T>;
  sms?: SmsTemplate<T>;
};

export type NotificationDefinition<T> = {
  event: string;
  dataValidator: Validator<T, "required", string>;
  category?: string;
  channels: ChannelTemplates<T>;
};
