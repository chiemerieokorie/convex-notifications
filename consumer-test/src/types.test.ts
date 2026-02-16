/**
 * Compile-time type assertions for the main export path.
 *
 * These tests verify that all exported types resolve correctly
 * when imported from the tarball via node_modules.
 * If this file compiles, all type exports are working.
 */
import { test } from "vitest";
import type {
  // Document types
  Notification,
  Preference,
  DeliveryLog,
  PushToken,
  ScheduledNotification,
  // Branded IDs
  NotificationId,
  DeliveryLogId,
  ScheduledNotificationId,
  // Channel types
  ChannelName,
  // Result types
  SendResult,
  DeliveryResult,
  // Context types
  RunQueryCtx,
  RunMutationCtx,
  RunActionCtx,
  // Config types
  NotificationsOptions,
  NotificationDefinition,
  AuthIdentity,
  ChannelConfig,
  EmailChannelConfig,
  PushChannelConfig,
  SmsChannelConfig,
  // Template types
  ChannelTemplates,
  EmailTemplate,
  InboxTemplate,
  PushTemplate,
  SmsTemplate,
  // Rendered types
  RenderedEmail,
  RenderedPush,
  RenderedSms,
} from "convex-notifications";

import {
  Notifications,
  createNotification,
  asNotificationId,
  asDeliveryLogId,
  asScheduledNotificationId,
} from "convex-notifications";

// --- Verify document types have string _id (not Id<"tableName">) ---
type AssertStringId<T extends { _id: string }> = T;
type _N = AssertStringId<Notification>;
type _P = AssertStringId<Preference>;
type _D = AssertStringId<DeliveryLog>;
type _T = AssertStringId<PushToken>;
type _S = AssertStringId<ScheduledNotification>;

// --- Verify branded IDs are string-compatible ---
test("branded IDs are string-compatible", () => {
  const nid: NotificationId = asNotificationId("test");
  const did: DeliveryLogId = asDeliveryLogId("test");
  const sid: ScheduledNotificationId = asScheduledNotificationId("test");

  // Branded IDs must be assignable to string
  const _s1: string = nid;
  const _s2: string = did;
  const _s3: string = sid;

  // Verify the branded ID functions return strings at runtime
  expect(typeof nid).toBe("string");
  expect(typeof did).toBe("string");
  expect(typeof sid).toBe("string");
});

// --- Verify ChannelName union ---
test("ChannelName accepts valid channels", () => {
  const channels: ChannelName[] = ["inbox", "email", "push", "sms"];
  expect(channels).toHaveLength(4);
});

// --- Verify SendResult shape ---
test("SendResult has expected structure", () => {
  // This is a compile-time check — if SendResult type is wrong, this won't compile
  type _Check = SendResult extends {
    notificationId: NotificationId;
    deliveries: DeliveryResult[];
  }
    ? true
    : never;
  const _: _Check = true;
});

// --- Verify Notifications class is constructable ---
test("Notifications class exists", () => {
  expect(Notifications).toBeDefined();
  expect(typeof Notifications).toBe("function");
});

// --- Verify createNotification exists ---
test("createNotification function exists", () => {
  expect(createNotification).toBeDefined();
  expect(typeof createNotification).toBe("function");
});

// --- Type-only usage to ensure all types resolve (prevents tree-shaking) ---
// These are never executed, just type-checked by tsc
type _UseRunQueryCtx = RunQueryCtx;
type _UseRunMutationCtx = RunMutationCtx;
type _UseRunActionCtx = RunActionCtx;
type _UseNotificationsOptions = NotificationsOptions;
type _UseAuthIdentity = AuthIdentity;
type _UseChannelConfig = ChannelConfig;
type _UseEmailChannelConfig = EmailChannelConfig;
type _UsePushChannelConfig = PushChannelConfig;
type _UseSmsChannelConfig = SmsChannelConfig;
type _UseChannelTemplates = ChannelTemplates<{ name: string }>;
type _UseEmailTemplate = EmailTemplate<{ name: string }>;
type _UseInboxTemplate = InboxTemplate<{ name: string }>;
type _UsePushTemplate = PushTemplate<{ name: string }>;
type _UseSmsTemplate = SmsTemplate<{ name: string }>;
type _UseRenderedEmail = RenderedEmail;
type _UseRenderedPush = RenderedPush;
type _UseRenderedSms = RenderedSms;
type _UseNotificationDefinition = NotificationDefinition<{ name: string }>;

import { expect } from "vitest";
