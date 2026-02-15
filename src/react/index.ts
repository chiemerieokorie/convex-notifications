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
 * Hook to access paginated notifications list.
 *
 * Uses Convex's built-in `usePaginatedQuery` for reactive pagination,
 * backed by `convex-helpers/server/pagination` paginator on the server.
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
  const context = useContext(NotificationsContext);
  const fn = listFn ?? context?.api.list;
  if (!fn) {
    throw new Error(
      "useNotifications requires either a list function argument or NotificationsProvider context"
    );
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
  const context = useContext(NotificationsContext);
  const fn = countFn ?? context?.api.unreadCount;
  if (!fn) {
    throw new Error(
      "useUnreadCount requires either a count function argument or NotificationsProvider context"
    );
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
  const context = useContext(NotificationsContext);
  const fn = prefsFn ?? context?.api.getPreferences;
  if (!fn) {
    throw new Error(
      "usePreferences requires either a preferences function argument or NotificationsProvider context"
    );
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
  const context = useContext(NotificationsContext);
  const fn = tokensFn ?? context?.api.getPushTokens;
  if (!fn) {
    throw new Error(
      "usePushTokens requires either a getPushTokens function argument or NotificationsProvider context with getPushTokens"
    );
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
  const context = useContext(NotificationsContext);
  const fn = logsFn ?? context?.api.getDeliveryLogs;
  if (!fn) {
    throw new Error(
      "useDeliveryLogs requires either a getDeliveryLogs function argument or NotificationsProvider context with getDeliveryLogs"
    );
  }

  return useQuery(fn, { notificationId }) ?? [];
}
