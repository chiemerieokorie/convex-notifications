"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

type AnyFunctionRef = FunctionReference<"query", "public">;

export function useNotifications(
  listFn: AnyFunctionRef,
  opts?: { initialNumItems?: number },
) {
  const result = usePaginatedQuery(listFn, {}, {
    initialNumItems: opts?.initialNumItems ?? 20,
  });
  return {
    notifications: result.results,
    loadMore: result.loadMore,
    status: result.status,
  };
}

export function useUnreadCount(countFn: AnyFunctionRef) {
  return useQuery(countFn, {}) ?? 0;
}

export function usePreferences(prefsFn: AnyFunctionRef) {
  return useQuery(prefsFn, {}) ?? [];
}
