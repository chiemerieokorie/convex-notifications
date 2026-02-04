"use client";

import {
  createElement,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

// Type for any query function reference
type AnyQueryRef = FunctionReference<"query", "public">;
type AnyMutationRef = FunctionReference<"mutation", "public">;

/**
 * API shape expected by the NotificationsProvider
 */
export type NotificationsApi = {
  list: AnyQueryRef;
  unreadCount: AnyQueryRef;
  markRead: AnyMutationRef;
  markAllRead: AnyMutationRef;
  archive: AnyMutationRef;
  getPreferences: AnyQueryRef;
  updatePreference: AnyMutationRef;
  registerPushToken?: AnyMutationRef;
  getPushTokens?: AnyQueryRef;
  deletePushToken?: AnyMutationRef;
  getDeliveryLogs?: AnyQueryRef;
};

/**
 * Context value for notifications
 */
type NotificationsContextValue = {
  api: NotificationsApi;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Provider component for notifications context.
 *
 * Wrap your app with this provider to enable the notification hooks.
 *
 * @example
 * ```tsx
 * import { NotificationsProvider } from "convex-notifications/react";
 * import { api } from "../convex/_generated/api";
 *
 * function App() {
 *   return (
 *     <NotificationsProvider api={api.notifications}>
 *       <InboxComponent />
 *     </NotificationsProvider>
 *   );
 * }
 * ```
 */
export function NotificationsProvider({
  api,
  children,
}: {
  api: NotificationsApi;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ api }), [api]);
  return createElement(NotificationsContext.Provider, { value }, children);
}

/**
 * Get the notifications API from context.
 * Throws if used outside of NotificationsProvider.
 */
function useNotificationsContext() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider. " +
      "Wrap your app with <NotificationsProvider api={api.notifications}>."
    );
  }
  return context;
}

/**
 * Hook to access paginated notifications list.
 *
 * Can be used with or without the provider:
 * - With provider: `useNotifications()` (no args needed)
 * - Without provider: `useNotifications(api.notifications.list)`
 *
 * @example
 * ```tsx
 * // With provider
 * function InboxWithProvider() {
 *   const { notifications, loadMore, status } = useNotifications();
 *   return (
 *     <div>
 *       {notifications.map(n => <NotificationItem key={n._id} notification={n} />)}
 *       {status === "CanLoadMore" && <button onClick={() => loadMore(10)}>Load more</button>}
 *     </div>
 *   );
 * }
 *
 * // Without provider
 * function InboxStandalone() {
 *   const { notifications, loadMore, status } = useNotifications(api.notifications.list);
 *   // ...
 * }
 * ```
 */
export function useNotifications(
  listFn?: AnyQueryRef,
  opts?: { initialNumItems?: number },
) {
  // Try to get from context if no function provided
  let fn = listFn;
  if (!fn) {
    const context = useContext(NotificationsContext);
    if (!context) {
      throw new Error(
        "useNotifications requires either a list function argument or NotificationsProvider context"
      );
    }
    fn = context.api.list;
  }

  const result = usePaginatedQuery(fn, {}, {
    initialNumItems: opts?.initialNumItems ?? 20,
  });

  return {
    notifications: result.results,
    loadMore: result.loadMore,
    status: result.status,
    isLoading: result.isLoading,
  };
}

/**
 * Hook to get the unread notification count.
 *
 * Can be used with or without the provider.
 *
 * @example
 * ```tsx
 * function NotificationBadge() {
 *   const count = useUnreadCount();
 *   return count > 0 ? <Badge>{count}</Badge> : null;
 * }
 * ```
 */
export function useUnreadCount(countFn?: AnyQueryRef): number {
  let fn = countFn;
  if (!fn) {
    const context = useContext(NotificationsContext);
    if (!context) {
      throw new Error(
        "useUnreadCount requires either a count function argument or NotificationsProvider context"
      );
    }
    fn = context.api.unreadCount;
  }

  return useQuery(fn, {}) ?? 0;
}

/**
 * Hook to get user notification preferences.
 *
 * Can be used with or without the provider.
 *
 * @example
 * ```tsx
 * function PreferencesPanel() {
 *   const preferences = usePreferences();
 *   return (
 *     <div>
 *       {preferences.map(pref => (
 *         <PreferenceToggle key={pref._id} preference={pref} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePreferences(prefsFn?: AnyQueryRef) {
  let fn = prefsFn;
  if (!fn) {
    const context = useContext(NotificationsContext);
    if (!context) {
      throw new Error(
        "usePreferences requires either a preferences function argument or NotificationsProvider context"
      );
    }
    fn = context.api.getPreferences;
  }

  return useQuery(fn, {}) ?? [];
}

/**
 * Hook to get push tokens for the current user.
 *
 * @example
 * ```tsx
 * function DevicesList() {
 *   const tokens = usePushTokens();
 *   return (
 *     <ul>
 *       {tokens.map(t => <li key={t._id}>{t.platform}: {t.token}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePushTokens(tokensFn?: AnyQueryRef) {
  let fn = tokensFn;
  if (!fn) {
    const context = useContext(NotificationsContext);
    if (!context?.api.getPushTokens) {
      throw new Error(
        "usePushTokens requires either a getPushTokens function argument or NotificationsProvider context with getPushTokens"
      );
    }
    fn = context.api.getPushTokens;
  }

  return useQuery(fn, {}) ?? [];
}

/**
 * Hook to get delivery logs for a notification.
 *
 * @example
 * ```tsx
 * function DeliveryStatus({ notificationId }: { notificationId: string }) {
 *   const logs = useDeliveryLogs(notificationId);
 *   return (
 *     <ul>
 *       {logs.map(log => (
 *         <li key={log._id}>{log.channel}: {log.status}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useDeliveryLogs(
  notificationId: string,
  logsFn?: AnyQueryRef,
) {
  let fn = logsFn;
  if (!fn) {
    const context = useContext(NotificationsContext);
    if (!context?.api.getDeliveryLogs) {
      throw new Error(
        "useDeliveryLogs requires either a getDeliveryLogs function argument or NotificationsProvider context with getDeliveryLogs"
      );
    }
    fn = context.api.getDeliveryLogs;
  }

  return useQuery(fn, { notificationId }) ?? [];
}

// Re-export for backwards compatibility
export type { NotificationsApi };
