import type { Auth } from "convex/server";
import type { Validator } from "convex/values";

export type NotificationsConfig = {
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
  body: (data: T) => string;
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
