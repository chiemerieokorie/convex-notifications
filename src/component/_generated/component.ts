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
        tenantId?: string;
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
      { tenantId?: string; notificationId: string; userId: string },
      null,
      Name
    >;
    list: FunctionReference<
      "query",
      "internal",
      { tenantId?: string; cursor?: number; limit?: number; userId: string },
      { cursor: number | null; notifications: any[] },
      Name
    >;
    markAllRead: FunctionReference<
      "mutation",
      "internal",
      { tenantId?: string; userId: string },
      null,
      Name
    >;
    markRead: FunctionReference<
      "mutation",
      "internal",
      { tenantId?: string; notificationId: string; userId: string },
      null,
      Name
    >;
    unreadCount: FunctionReference<
      "query",
      "internal",
      { tenantId?: string; userId: string },
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
        tenantId?: string;
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
      { tenantId?: string; userId: string },
      any[],
      Name
    >;
    resolvePreferences: FunctionReference<
      "query",
      "internal",
      {
        tenantId?: string;
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
        tenantId?: string;
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
  pushTokens: {
    registerPushToken: FunctionReference<
      "mutation",
      "internal",
      {
        tenantId?: string;
        userId: string;
        token: string;
        platform?: "ios" | "android" | "web";
        deviceId?: string;
      },
      string,
      Name
    >;
    getPushTokens: FunctionReference<
      "query",
      "internal",
      { tenantId?: string; userId: string },
      Array<{
        _id: string;
        _creationTime: number;
        tenantId?: string;
        userId: string;
        token: string;
        platform?: "ios" | "android" | "web";
        deviceId?: string;
      }>,
      Name
    >;
    deletePushToken: FunctionReference<
      "mutation",
      "internal",
      { tenantId?: string; userId: string; token: string },
      boolean,
      Name
    >;
  };
  scheduled: {
    scheduleNotification: FunctionReference<
      "mutation",
      "internal",
      {
        tenantId?: string;
        userId: string;
        event: string;
        category?: string;
        title: string;
        body: string;
        data?: any;
        channels: any;
        scheduledFor: number;
        transactional?: boolean;
        deduplicationKey?: string;
      },
      string,
      Name
    >;
    cancelScheduledNotification: FunctionReference<
      "mutation",
      "internal",
      { tenantId?: string; id: string; userId: string },
      boolean,
      Name
    >;
    getScheduledNotifications: FunctionReference<
      "query",
      "internal",
      {
        tenantId?: string;
        userId: string;
        status?: "pending" | "processing" | "sent" | "failed" | "cancelled";
      },
      any[],
      Name
    >;
  };
};
