"use client";
import React, { createContext, useContext, type ReactNode } from "react";
import {
  useQuery,
  usePaginatedQuery,
  useMutation,
  type PaginatedQueryReference,
} from "convex/react";
import type { FunctionReference } from "convex/server";

// ---------------------------------------------------------------------------
// Types for the API shape returned by notifications.api()
// ---------------------------------------------------------------------------

type AnyQuery = FunctionReference<"query", any, any, any>;
type AnyMutation = FunctionReference<"mutation", any, any, any>;

export type NotificationsApi = {
  list: AnyQuery;
  unreadCount: AnyQuery;
  markRead: AnyMutation;
  markAllRead: AnyMutation;
  archive: AnyMutation;
  getPreferences: AnyQuery;
  updatePreference: AnyMutation;
  registerPushToken: AnyMutation;
  getPushTokens: AnyQuery;
  deletePushToken: AnyMutation;
  getDeliveryLogs: AnyQuery;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NotificationsContext = createContext<NotificationsApi | null>(null);

function useApi(): NotificationsApi {
  const api = useContext(NotificationsContext);
  if (!api) {
    throw new Error(
      "useNotifications/useUnreadCount/etc. must be used within a <NotificationsProvider>. " +
      "Wrap your app with <NotificationsProvider api={notifications.api({ auth })} />",
    );
  }
  return api;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides the notifications API to all child components via React context.
 *
 * @example
 * ```tsx
 * import { api } from "../convex/_generated/api";
 *
 * <NotificationsProvider api={api.notifications}>
 *   <App />
 * </NotificationsProvider>
 * ```
 */
export function NotificationsProvider({
  api,
  children,
}: {
  api: NotificationsApi;
  children: ReactNode;
}) {
  return React.createElement(
    NotificationsContext.Provider,
    { value: api },
    children,
  );
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Paginated list of notifications.
 *
 * @example
 * ```tsx
 * const { results, loadMore, status } = useNotifications();
 * ```
 */
export function useNotifications(opts?: { numItems?: number }) {
  const api = useApi();
  return usePaginatedQuery(
    api.list as PaginatedQueryReference,
    {},
    { initialNumItems: opts?.numItems ?? 20 },
  );
}

/**
 * Subscribe to unread notification count.
 *
 * @example
 * ```tsx
 * const count = useUnreadCount();
 * ```
 */
export function useUnreadCount(): number | undefined {
  const api = useApi();
  return useQuery(api.unreadCount, {});
}

/**
 * Subscribe to user preferences.
 *
 * @example
 * ```tsx
 * const preferences = usePreferences();
 * ```
 */
export function usePreferences(): any[] | undefined {
  const api = useApi();
  return useQuery(api.getPreferences, {});
}

/**
 * Subscribe to push tokens.
 *
 * @example
 * ```tsx
 * const tokens = usePushTokens();
 * ```
 */
export function usePushTokens(): any[] | undefined {
  const api = useApi();
  return useQuery(api.getPushTokens, {});
}

/**
 * Subscribe to delivery logs for a specific notification.
 *
 * @example
 * ```tsx
 * const logs = useDeliveryLogs(notificationId);
 * ```
 */
export function useDeliveryLogs(notificationId: string): any[] | undefined {
  const api = useApi();
  return useQuery(api.getDeliveryLogs, { notificationId });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Returns a mutation function to mark a notification as read.
 *
 * @example
 * ```tsx
 * const markRead = useMarkRead();
 * await markRead({ notificationId: n._id });
 * ```
 */
export function useMarkRead() {
  const api = useApi();
  return useMutation(api.markRead);
}

/**
 * Returns a mutation function to mark all notifications as read.
 *
 * @example
 * ```tsx
 * const markAllRead = useMarkAllRead();
 * await markAllRead({});
 * ```
 */
export function useMarkAllRead() {
  const api = useApi();
  return useMutation(api.markAllRead);
}

/**
 * Returns a mutation function to archive a notification.
 *
 * @example
 * ```tsx
 * const archive = useArchive();
 * await archive({ notificationId: n._id });
 * ```
 */
export function useArchive() {
  const api = useApi();
  return useMutation(api.archive);
}

/**
 * Returns a mutation function to update a preference.
 *
 * @example
 * ```tsx
 * const updatePref = useUpdatePreference();
 * await updatePref({ level: "global", channel: "email", enabled: false });
 * ```
 */
export function useUpdatePreference() {
  const api = useApi();
  return useMutation(api.updatePreference);
}

/**
 * Returns a mutation function to register a push token.
 *
 * @example
 * ```tsx
 * const register = useRegisterPushToken();
 * await register({ token: expoPushToken, platform: "ios" });
 * ```
 */
export function useRegisterPushToken() {
  const api = useApi();
  return useMutation(api.registerPushToken);
}

/**
 * Returns a mutation function to delete a push token.
 *
 * @example
 * ```tsx
 * const deleteToken = useDeletePushToken();
 * await deleteToken({ token: "ExponentPushToken[...]" });
 * ```
 */
export function useDeletePushToken() {
  const api = useApi();
  return useMutation(api.deletePushToken);
}
