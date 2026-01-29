/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

export type ComponentApi<
  Name extends string | undefined = string | undefined,
> = {
  delivery: {
    createDeliveryLog: FunctionReference<
      "mutation",
      "internal",
      {
        channel: string;
        metadata?: any;
        notificationId: string;
        status: "pending" | "sent" | "delivered" | "failed";
      },
      string,
      Name
    >;
    getDeliveryLogs: FunctionReference<
      "query",
      "internal",
      { notificationId: string },
      any[],
      Name
    >;
    updateDeliveryStatus: FunctionReference<
      "mutation",
      "internal",
      {
        deliveryLogId: string;
        error?: string;
        sentAt?: number;
        status: "sent" | "delivered" | "failed";
      },
      null,
      Name
    >;
  };
  inbox: {
    archive: FunctionReference<
      "mutation",
      "internal",
      { notificationId: string; userId: string },
      null,
      Name
    >;
    list: FunctionReference<
      "query",
      "internal",
      { cursor?: number; limit?: number; userId: string },
      { cursor: number | null; notifications: any[] },
      Name
    >;
    markAllRead: FunctionReference<
      "mutation",
      "internal",
      { userId: string },
      null,
      Name
    >;
    markRead: FunctionReference<
      "mutation",
      "internal",
      { notificationId: string; userId: string },
      null,
      Name
    >;
    unreadCount: FunctionReference<
      "query",
      "internal",
      { userId: string },
      number,
      Name
    >;
  };
  notifications: {
    checkDeduplication: FunctionReference<
      "query",
      "internal",
      { key: string },
      boolean,
      Name
    >;
    createNotification: FunctionReference<
      "mutation",
      "internal",
      {
        body: string;
        data?: any;
        event: string;
        title: string;
        transactional?: boolean;
        userId: string;
      },
      string,
      Name
    >;
    recordDeduplication: FunctionReference<
      "mutation",
      "internal",
      { key: string; ttlSeconds: number },
      string,
      Name
    >;
  };
  preferences: {
    getPreferences: FunctionReference<
      "query",
      "internal",
      { userId: string },
      any[],
      Name
    >;
    resolvePreferences: FunctionReference<
      "query",
      "internal",
      {
        category?: string;
        channels: string[];
        event: string;
        userId: string;
      },
      string[],
      Name
    >;
    updatePreference: FunctionReference<
      "mutation",
      "internal",
      {
        channel: string;
        enabled: boolean;
        key?: string;
        level: "global" | "category" | "event";
        userId: string;
      },
      string,
      Name
    >;
  };
};
