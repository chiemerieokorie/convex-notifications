"use client";

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { useCallback } from "react";
import type { FunctionReference } from "convex/server";

type QueryRef = FunctionReference<"query", "public">;
type MutationRef = FunctionReference<"mutation", "public">;

// --- Full API hook ---

type NotificationsApi = {
  list: QueryRef;
  unreadCount: QueryRef;
  markRead: MutationRef;
  markAllRead: MutationRef;
  archive: MutationRef;
};

/**
 * All-in-one hook for the notification inbox.
 *
 * ```tsx
 * const { notifications, unreadCount, markRead, markAllRead, archive, loadMore, status } =
 *   useNotifications({
 *     list: api.notifications.list,
 *     unreadCount: api.notifications.unreadCount,
 *     markRead: api.notifications.markRead,
 *     markAllRead: api.notifications.markAllRead,
 *     archive: api.notifications.archive,
 *   });
 * ```
 */
export function useNotifications(
  apiOrListFn: NotificationsApi | QueryRef,
  opts?: { initialNumItems?: number },
) {
  const isFullApi =
    typeof apiOrListFn === "object" && "list" in apiOrListFn;
  const listFn = isFullApi ? apiOrListFn.list : apiOrListFn;

  const { results, loadMore, status } = usePaginatedQuery(
    listFn,
    {},
    { initialNumItems: opts?.initialNumItems ?? 20 },
  );

  // Only call hooks when full API is provided
  const markReadMutation = useMutation(
    isFullApi ? apiOrListFn.markRead : (listFn as any),
  );
  const markAllReadMutation = useMutation(
    isFullApi ? apiOrListFn.markAllRead : (listFn as any),
  );
  const archiveMutation = useMutation(
    isFullApi ? apiOrListFn.archive : (listFn as any),
  );
  const unreadCount = useQuery(
    isFullApi ? apiOrListFn.unreadCount : (listFn as any),
    isFullApi ? {} : "skip",
  );

  const markRead = useCallback(
    (notificationId: string) =>
      markReadMutation({ notificationId } as any),
    [markReadMutation],
  );
  const markAllRead = useCallback(
    () => markAllReadMutation({} as any),
    [markAllReadMutation],
  );
  const archive = useCallback(
    (notificationId: string) =>
      archiveMutation({ notificationId } as any),
    [archiveMutation],
  );

  return {
    notifications: results,
    loadMore,
    status,
    unreadCount: (unreadCount as number | undefined) ?? 0,
    ...(isFullApi ? { markRead, markAllRead, archive } : {}),
  };
}

// --- Standalone hooks (backward-compatible) ---

export function useUnreadCount(countFn: QueryRef) {
  return useQuery(countFn, {}) ?? 0;
}

type PreferencesApi = {
  getPreferences: QueryRef;
  updatePreference: MutationRef;
};

/**
 * Hook for notification preferences with optional mutation.
 *
 * ```tsx
 * const { preferences, updatePreference } = usePreferences({
 *   getPreferences: api.notifications.getPreferences,
 *   updatePreference: api.notifications.updatePreference,
 * });
 * ```
 */
export function usePreferences(
  apiOrQueryFn: PreferencesApi | QueryRef,
) {
  const isFullApi =
    typeof apiOrQueryFn === "object" && "getPreferences" in apiOrQueryFn;
  const queryFn = isFullApi
    ? apiOrQueryFn.getPreferences
    : apiOrQueryFn;

  const preferences = useQuery(queryFn, {}) ?? [];

  const updateMutation = useMutation(
    isFullApi ? apiOrQueryFn.updatePreference : (queryFn as any),
  );

  const updatePreference = useCallback(
    (args: {
      level: string;
      key?: string;
      channel: string;
      enabled: boolean;
    }) => updateMutation(args as any),
    [updateMutation],
  );

  return {
    preferences,
    ...(isFullApi ? { updatePreference } : {}),
  };
}
