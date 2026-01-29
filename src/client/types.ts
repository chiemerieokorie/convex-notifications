import type { Auth } from "convex/server";
import type { Validator } from "convex/values";

// --- User settings resolver ---

export type UserSettings = {
  timezone?: string;
  quietHoursStart?: number; // minutes from midnight (e.g. 1380 = 11pm)
  quietHoursEnd?: number; // minutes from midnight (e.g. 480 = 8am)
};

// --- Options ---

export type NotificationsOptions = {
  auth: (ctx: { auth: Auth }) => Promise<string>;
  resolvers?: {
    email?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
    phone?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
    pushToken?: (ctx: { auth: Auth }, userId: string) => Promise<string | null>;
    settings?: (
      ctx: { auth: Auth },
      userId: string,
    ) => Promise<UserSettings | null>;
  };
};

// --- Channel templates ---

export type InboxTemplate<T> = {
  title: (data: T) => string;
  body: (data: T) => string;
  actionUrl?: (data: T) => string;
  imageUrl?: (data: T) => string;
};

export type EmailTemplate<T> = {
  subject: (data: T) => string;
  body: (data: T) => string;
  html?: (data: T) => string;
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

// --- Rate limiting ---

export type RateLimitConfig = {
  kind: "token bucket" | "fixed window";
  rate: number;
  period: number;
  capacity?: number;
};

// --- Batching ---

export type BatchConfig<T> = {
  windowMs: number;
  batchKey: (data: T, userId: string) => string;
  templates: {
    inbox?: {
      title: (items: T[]) => string;
      body: (items: T[]) => string;
      actionUrl?: (items: T[]) => string;
    };
    email?: {
      subject: (items: T[]) => string;
      body: (items: T[]) => string;
      html?: (items: T[]) => string;
    };
    push?: {
      title: (items: T[]) => string;
      body: (items: T[]) => string;
    };
    sms?: {
      body: (items: T[]) => string;
    };
  };
};

// --- Channel adapters ---

export type RenderedMessage = Record<string, string>;

export interface ChannelAdapter {
  channel: string;
  render(template: any, data: any): RenderedMessage;
  dispatch(
    address: string,
    rendered: RenderedMessage,
  ): Promise<string | void>;
}

// --- Notification definition ---

export type NotificationDefinition<T> = {
  event: string;
  dataValidator: Validator<T, "required", string>;
  category?: string;
  transactional?: boolean;
  channels: ChannelTemplates<T>;
  rateLimit?: RateLimitConfig;
  batch?: BatchConfig<T>;
};

// --- Send args ---

export type SendArgs<T> = {
  userId: string;
  data: T;
  transactional?: boolean;
  deduplicationKey?: string;
  deduplicationTtlSeconds?: number;
  cancellationKey?: string;
};
