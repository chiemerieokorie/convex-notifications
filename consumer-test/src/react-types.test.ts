/**
 * Compile-time type assertions for the react export path.
 *
 * Verifies that react hooks and re-exported types resolve correctly.
 * If this file compiles, the react subpath export is working.
 */
import { test, expect } from "vitest";
import type {
  // Re-exported document types from react subpath
  Notification,
  Preference,
  DeliveryLog,
  PushToken,
  // Provider types
  NotificationsApi,
} from "convex-notifications/react";

// Verify the hooks and components are importable
import {
  useNotifications,
  useUnreadCount,
  usePreferences,
  usePushTokens,
  useDeliveryLogs,
  NotificationsProvider,
} from "convex-notifications/react";

// --- Verify document types resolve from react subpath ---
type AssertStringId<T extends { _id: string }> = T;
type _N = AssertStringId<Notification>;
type _P = AssertStringId<Preference>;
type _D = AssertStringId<DeliveryLog>;
type _T = AssertStringId<PushToken>;

// --- Type-only usage for provider types ---
type _UseNotificationsApi = NotificationsApi;

// --- Verify hooks and components are defined ---
test("NotificationsProvider is exported", () => {
  expect(NotificationsProvider).toBeDefined();
  expect(typeof NotificationsProvider).toBe("function");
});

test("react hooks are exported", () => {
  expect(useNotifications).toBeDefined();
  expect(useUnreadCount).toBeDefined();
  expect(usePreferences).toBeDefined();
  expect(usePushTokens).toBeDefined();
  expect(useDeliveryLogs).toBeDefined();
});

test("react hooks are functions", () => {
  expect(typeof useNotifications).toBe("function");
  expect(typeof useUnreadCount).toBe("function");
  expect(typeof usePreferences).toBe("function");
  expect(typeof usePushTokens).toBe("function");
  expect(typeof useDeliveryLogs).toBe("function");
});
