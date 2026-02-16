/**
 * Runtime import verification for all export paths.
 * These tests verify that every package.json "exports" entry
 * resolves to real JS when imported from node_modules.
 */
import { test, expect } from "vitest";

test("main export resolves", async () => {
  const mod = await import("convex-notifications");
  expect(mod.Notifications).toBeDefined();
  expect(mod.createNotification).toBeDefined();
  expect(mod.asNotificationId).toBeDefined();
  expect(mod.asDeliveryLogId).toBeDefined();
  expect(mod.asScheduledNotificationId).toBeDefined();
});

test("react export resolves", async () => {
  const mod = await import("convex-notifications/react");
  expect(mod.useNotifications).toBeDefined();
  expect(mod.useUnreadCount).toBeDefined();
  expect(mod.usePreferences).toBeDefined();
});

// convex.config.js uses component.use() which requires the Convex runtime.
// We verify the module is reachable (import starts) but expect the runtime error.
// The type-level check (tsc) already validates this export path resolves.
test("convex.config export is reachable", async () => {
  try {
    await import("convex-notifications/convex.config.js");
  } catch (e: any) {
    // Expected: component.use() throws outside Convex runtime
    expect(e.message).toContain("componentDefinitionPath");
  }
});

test("channels export resolves", async () => {
  const mod = await import("convex-notifications/channels");
  expect(mod.isValidEmail).toBeDefined();
  expect(mod.isValidPhoneNumber).toBeDefined();
  expect(mod.isValidPushToken).toBeDefined();
});

test("webhooks export resolves", async () => {
  const mod = await import("convex-notifications/webhooks");
  expect(mod.resendWebhook).toBeDefined();
  expect(mod.twilioWebhook).toBeDefined();
});

// NOTE: "./test" export is skipped — it uses import.meta.glob (Vite API)
// and raw .ts source. Only works in Vite-powered environments (convex-test).
